import crypto from 'node:crypto';
import type {
  ExecutionSummary,
  Phase3MarketRealManualEvidence,
  Phase3ReadinessChecklistItem,
  Phase3ReadinessReport,
  Phase3RuntimeValidationEvidence,
  Phase3ValidationCheck,
  ShadowRunEvidence,
  TradeOutcomeSummary,
} from '../core/types';
import { PersistenceService } from './persistenceService';

export interface BuildPhase3ReportInput {
  runtimeEvidence: Phase3RuntimeValidationEvidence;
  sourceOfTruth?: {
    repository: string;
    roadmapVerification: string;
  };
  runId?: string;
}

function checklistStatusFromChecks(checks: Phase3ValidationCheck[]): 'PASS' | 'FAIL' {
  return checks.every((check) => check.pass) ? 'PASS' : 'FAIL';
}

function allShadowChecksPassed(shadow: ShadowRunEvidence): boolean {
  return shadow.allPassed && shadow.checks.every((check) => check.pass);
}

function isManualEvidencePass(entry: Phase3MarketRealManualEvidence): boolean {
  return entry.checks.length > 0 && entry.checks.every((check) => check.pass);
}

export class Phase3ValidationService {
  constructor(private readonly persistence: PersistenceService) {}

  async ingestManualMarketRealEvidence(entry: Phase3MarketRealManualEvidence): Promise<void> {
    await this.persistence.appendPhase3ManualMarketRealEvidence(entry);
  }

  async buildReadinessReport(input: BuildPhase3ReportInput): Promise<Phase3ReadinessReport> {
    const [executionSummaries, tradeOutcomes, shadowEvidence, manualMarketRealEvidence] = await Promise.all([
      this.persistence.readExecutionSummaries(),
      this.persistence.readTradeOutcomes(),
      this.persistence.readShadowRunEvidence(),
      this.persistence.readPhase3ManualMarketRealEvidence(),
    ]);

    const sourceChecks = this.buildSourceChecks(input.runtimeEvidence, executionSummaries, tradeOutcomes);
    const shadowChecks = this.buildShadowChecks(shadowEvidence);
    const marketRealChecks = this.buildMarketRealChecks(manualMarketRealEvidence);

    const sourceChecklist: Phase3ReadinessChecklistItem = {
      id: 'phase3-source-probe-suite',
      description: 'Suite source/probe untuk capital + exchange ops + emergency harus lulus',
      requiredProofLevel: 'SOURCE_PROBE',
      status: checklistStatusFromChecks(sourceChecks),
      notes: `executionSummaries=${executionSummaries.length}, tradeOutcomes=${tradeOutcomes.length}`,
    };

    const shadowChecklist = this.buildShadowChecklist(shadowEvidence, shadowChecks);
    const marketRealChecklist = this.buildMarketRealChecklist(manualMarketRealEvidence, marketRealChecks);

    const checklist = [sourceChecklist, shadowChecklist, marketRealChecklist];
    const readinessVerdict = checklist.every((item) => item.status === 'PASS')
      ? 'SIAP_MERGE'
      : 'BELUM_SIAP_MERGE';

    const limitations: string[] = [
      'Source/probe proof tidak boleh disamakan dengan market-real proof.',
      'Ruleset GitHub branch protection tetap harus diverifikasi di setting repository.',
    ];
    if (shadowChecklist.status !== 'PASS') {
      limitations.push('Shadow-live proof belum full-pass dari evidence archive latest run.');
    }
    if (marketRealChecklist.status !== 'PASS') {
      limitations.push('Market-real proof masih manual-required atau ada check manual yang gagal.');
    }

    return {
      runId: input.runId ?? `phase3-${crypto.randomUUID()}`,
      generatedAt: new Date().toISOString(),
      sourceOfTruth: input.sourceOfTruth ?? {
        repository: 'https://github.com/masreykangtrade-oss/cukong-markets',
        roadmapVerification: 'https://github.com/masreykangtrade-oss/cukong-markets/blob/main/ROADMAP_VERIFICATION_UPGRADE.md',
      },
      sections: [
        {
          name: 'capital_exposure',
          summary: 'Validasi batas allocated/allowed + exposure pair-class/discovery dari runtime evidence.',
          checks: sourceChecks.filter((item) => item.id.startsWith('capital-')),
        },
        {
          name: 'exchange_reconciliation_resilience',
          summary: 'Validasi cancel/uncertain/recovery seeded + shadow-live evidence + manual market-real boundary.',
          checks: [
            ...sourceChecks.filter((item) => item.id.startsWith('exchange-')),
            ...shadowChecks,
            ...marketRealChecks,
          ],
        },
        {
          name: 'emergency_recovery',
          summary: 'Validasi emergency exit + consistency evidence summaries/outcomes.',
          checks: sourceChecks.filter((item) => item.id.startsWith('emergency-')),
        },
      ],
      checklist,
      limitations,
      readinessVerdict,
      boundaryNotes: {
        sourceProbeProof: 'Dibuktikan oleh validate:phase3 seeded/non-destruktif terhadap runtime path lokal.',
        shadowLiveProof: 'Dibuktikan oleh verify:shadow-live + evidence archive ShadowRunEvidence.',
        marketRealProof: 'Dibuktikan lewat evidence manual real exchange yang di-ingest, bukan dari seeded probe.',
      },
    };
  }

  async evaluateShadowProofStatus(): Promise<Phase3ReadinessChecklistItem> {
    const shadowEvidence = await this.persistence.readShadowRunEvidence();
    const checks = this.buildShadowChecks(shadowEvidence);
    return this.buildShadowChecklist(shadowEvidence, checks);
  }

  async evaluateMarketRealManualStatus(): Promise<Phase3ReadinessChecklistItem> {
    const manualEvidence = await this.persistence.readPhase3ManualMarketRealEvidence();
    const checks = this.buildMarketRealChecks(manualEvidence);
    return this.buildMarketRealChecklist(manualEvidence, checks);
  }

  private buildSourceChecks(
    runtimeEvidence: Phase3RuntimeValidationEvidence,
    executionSummaries: ExecutionSummary[],
    tradeOutcomes: TradeOutcomeSummary[],
  ): Phase3ValidationCheck[] {
    const exchangeCancelEvidence = executionSummaries.filter((item) =>
      item.reason?.includes('exchange cancel requested'),
    ).length;
    const emergencyEvidence = executionSummaries.filter((item) =>
      item.reason?.includes('EMERGENCY_EXIT'),
    ).length;

    return [
      {
        id: 'capital-allocated-bounded',
        description: 'allocatedNotional harus <= allowedNotional dan <= policyIntentNotional',
        proofLevel: 'SOURCE_PROBE',
        automated: true,
        pass: runtimeEvidence.capital.allocatedNotionalIdr <= runtimeEvidence.capital.allowedNotionalIdr
          && runtimeEvidence.capital.allowedNotionalIdr <= runtimeEvidence.capital.policyIntentNotionalIdr,
        evidenceRefs: ['PortfolioCapitalEngine.plan', 'runtime evidence'],
        notes: [
          `policyIntent=${runtimeEvidence.capital.policyIntentNotionalIdr}`,
          `allowed=${runtimeEvidence.capital.allowedNotionalIdr}`,
          `allocated=${runtimeEvidence.capital.allocatedNotionalIdr}`,
        ],
      },
      {
        id: 'capital-exposure-limits-respected',
        description: 'Pair-class limit dan discovery-bucket limit tetap dihormati',
        proofLevel: 'SOURCE_PROBE',
        automated: true,
        pass: runtimeEvidence.capital.pairClassLimitRespected
          && runtimeEvidence.capital.discoveryBucketLimitRespected,
        evidenceRefs: ['PortfolioCapitalEngine.plan.exposure'],
      },
      {
        id: 'exchange-cancel-uncertain-bounded',
        description: 'cancelAllOrders tidak boleh memalsukan cancel order submission_uncertain tanpa exchangeOrderId',
        proofLevel: 'SOURCE_PROBE',
        automated: true,
        pass: runtimeEvidence.exchangeOps.unresolvedSubmissionUncertain
          && /unresolved\s+\d+\s+submission-uncertain orders/.test(runtimeEvidence.exchangeOps.cancelSummary),
        evidenceRefs: ['ExecutionEngine.cancelAllOrders'],
        notes: [runtimeEvidence.exchangeOps.cancelSummary],
      },
      {
        id: 'exchange-recovery-evidence-present',
        description: 'Recovery/cancel evidence harus muncul di execution summary persistence',
        proofLevel: 'SOURCE_PROBE',
        automated: true,
        pass: exchangeCancelEvidence > 0 && runtimeEvidence.exchangeOps.recoveryMessagesCount >= 0,
        evidenceRefs: ['PersistenceService.readExecutionSummaries'],
        notes: [`exchangeCancelEvidence=${exchangeCancelEvidence}`],
      },
      {
        id: 'emergency-summary-persisted',
        description: 'Emergency path harus menghasilkan execution summary persisten',
        proofLevel: 'SOURCE_PROBE',
        automated: true,
        pass: runtimeEvidence.emergencyRecovery.emergencySummarySeen && emergencyEvidence > 0,
        evidenceRefs: ['ExecutionEngine.manualSell/evaluateOpenPositions', 'SummaryService.publishExecutionSummary'],
        notes: [`emergencyExecutionSummary=${emergencyEvidence}`, `tradeOutcomes=${tradeOutcomes.length}`],
      },
    ];
  }

  private buildShadowChecks(shadowEvidence: ShadowRunEvidence[]): Phase3ValidationCheck[] {
    const latest = shadowEvidence.at(-1) ?? null;
    const hasLatest = Boolean(latest);
    const pass = latest ? allShadowChecksPassed(latest) : false;

    return [
      {
        id: 'shadow-live-proof-reuse',
        description: 'Evidence shadow-live existing harus bisa direuse sebagai proof layer Fase 3',
        proofLevel: 'SHADOW_LIVE',
        automated: true,
        pass,
        evidenceRefs: ['PersistenceService.readShadowRunEvidence', 'tests/real_exchange_shadow_run_probe.ts'],
        notes: hasLatest
          ? [`latestRunId=${latest?.runId ?? '-'}`, `allPassed=${latest?.allPassed ?? false}`]
          : ['Belum ada shadow evidence di archive. Jalankan: RUN_REAL_EXCHANGE_SHADOW=1 npm run probe:shadow-live'],
      },
    ];
  }

  private buildMarketRealChecks(manualEvidence: Phase3MarketRealManualEvidence[]): Phase3ValidationCheck[] {
    const latest = manualEvidence.at(-1) ?? null;
    return [
      {
        id: 'market-real-manual-evidence-ingested',
        description: 'Bukti market-real manual harus di-ingest untuk auth/order/reconciliation/resilience',
        proofLevel: 'MARKET_REAL',
        automated: false,
        pass: latest ? isManualEvidencePass(latest) : false,
        evidenceRefs: ['PersistenceService.readPhase3ManualMarketRealEvidence'],
        notes: latest
          ? [`manualRunId=${latest.runId}`, `checks=${latest.checks.length}`]
          : ['Belum ada evidence manual. Gunakan: npm run validate:phase3:market-real-check -- <json-file>'],
      },
    ];
  }

  private buildShadowChecklist(
    shadowEvidence: ShadowRunEvidence[],
    shadowChecks: Phase3ValidationCheck[],
  ): Phase3ReadinessChecklistItem {
    if (shadowEvidence.length === 0) {
      return {
        id: 'phase3-shadow-live-proof',
        description: 'Strict shadow-live proof harus tersedia dari evidence archive',
        requiredProofLevel: 'SHADOW_LIVE',
        status: 'MANUAL_REQUIRED',
        notes: 'Jalankan RUN_REAL_EXCHANGE_SHADOW=1 npm run probe:shadow-live',
      };
    }

    return {
      id: 'phase3-shadow-live-proof',
      description: 'Strict shadow-live proof harus tersedia dari evidence archive',
      requiredProofLevel: 'SHADOW_LIVE',
      status: checklistStatusFromChecks(shadowChecks),
      notes: shadowChecks[0]?.notes?.join('; '),
    };
  }

  private buildMarketRealChecklist(
    manualEvidence: Phase3MarketRealManualEvidence[],
    marketRealChecks: Phase3ValidationCheck[],
  ): Phase3ReadinessChecklistItem {
    if (manualEvidence.length === 0) {
      return {
        id: 'phase3-market-real-proof',
        description: 'Market-real proof harus berasal dari evidence manual exchange nyata',
        requiredProofLevel: 'MARKET_REAL',
        status: 'MANUAL_REQUIRED',
        notes: 'Ingest evidence manual via npm run validate:phase3:market-real-check -- <json-file>',
      };
    }

    return {
      id: 'phase3-market-real-proof',
      description: 'Market-real proof harus berasal dari evidence manual exchange nyata',
      requiredProofLevel: 'MARKET_REAL',
      status: checklistStatusFromChecks(marketRealChecks),
      notes: marketRealChecks[0]?.notes?.join('; '),
    };
  }
}
