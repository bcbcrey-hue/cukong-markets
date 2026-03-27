import type {
  BotSettings,
  DiscoveryBucketType,
  OpportunityAssessment,
  PairClass,
  PortfolioCapitalPlan,
  PositionRecord,
  RuntimeCandidateCapitalContext,
} from '../../core/types';

interface PortfolioCapitalPlanInput {
  settings: BotSettings;
  opportunity: OpportunityAssessment;
  policyDecision: {
    action: 'ENTER' | 'SKIP' | 'WAIT';
    sizeMultiplier: number;
  };
  openPositions: PositionRecord[];
}

interface PositionExposureContext {
  pairClass: PairClass;
  discoveryBucket: DiscoveryBucketType;
  notionalIdr: number;
}

function toNotionalIdr(position: PositionRecord): number {
  if (!Number.isFinite(position.currentPrice) || position.currentPrice <= 0) {
    return 0;
  }

  return Math.max(0, position.quantity * position.currentPrice);
}

export class PortfolioCapitalEngine {
  private positionContext(position: PositionRecord): PositionExposureContext {
    return {
      pairClass: position.exposurePairClass ?? 'MAJOR',
      discoveryBucket: position.exposureDiscoveryBucket ?? 'LIQUID_LEADER',
      notionalIdr: toNotionalIdr(position),
    };
  }

  plan(input: PortfolioCapitalPlanInput): {
    capitalPlan: PortfolioCapitalPlan;
    capitalContext: RuntimeCandidateCapitalContext;
  } {
    const settings = input.settings.portfolio;
    const reasons: string[] = [];
    const currentPairClass = input.opportunity.pairClass ?? 'MAJOR';
    const currentBucket = input.opportunity.discoveryBucket ?? 'LIQUID_LEADER';

    const exposures = input.openPositions.map((position) => this.positionContext(position));
    const legacyExposureFallbackCount = input.openPositions.filter(
      (position) => !position.exposurePairClass || !position.exposureDiscoveryBucket,
    ).length;

    const totalDeployed = exposures.reduce((sum, item) => sum + item.notionalIdr, 0);
    const currentPairClassExposure = exposures
      .filter((item) => item.pairClass === currentPairClass)
      .reduce((sum, item) => sum + item.notionalIdr, 0);
    const currentBucketExposure = exposures
      .filter((item) => item.discoveryBucket === currentBucket)
      .reduce((sum, item) => sum + item.notionalIdr, 0);

    const requestedNotional = Math.max(0, settings.baseEntryCapitalIdr * input.policyDecision.sizeMultiplier);
    const riskBudgetCap = Math.max(0, settings.maxTotalDeployedCapitalIdr * settings.riskBudgetPerPositionPct);
    const totalRemaining = Math.max(0, settings.maxTotalDeployedCapitalIdr - totalDeployed);
    const pairClassCap = Math.max(0, settings.maxTotalDeployedCapitalIdr * settings.maxExposurePerPairClassPct[currentPairClass]);
    const pairClassRemaining = Math.max(0, pairClassCap - currentPairClassExposure);
    const discoveryCap = Math.max(
      0,
      settings.maxTotalDeployedCapitalIdr * settings.maxExposurePerDiscoveryBucketPct[currentBucket],
    );
    const discoveryRemaining = Math.max(0, discoveryCap - currentBucketExposure);

    const depthScore = input.opportunity.depthScore ?? 0;
    const thinBookCap = depthScore < settings.thinBookDepthScoreThreshold
      ? Math.max(0, requestedNotional * settings.thinBookCapMultiplier)
      : null;

    if (input.policyDecision.action !== 'ENTER') {
      reasons.push(`Policy action ${input.policyDecision.action}: capital allocation diblok`);
    }
    if (legacyExposureFallbackCount > 0) {
      reasons.push(
        `Exposure memakai fallback legacy untuk ${legacyExposureFallbackCount} posisi terbuka (metadata exposure belum lengkap)`,
      );
    }

    if (thinBookCap !== null) {
      reasons.push(
        `Thin-book cap aktif: depthScore=${depthScore.toFixed(1)} < threshold=${settings.thinBookDepthScoreThreshold.toFixed(1)}`,
      );
    }

    const allowedNotional = Math.max(
      0,
      Math.min(
        requestedNotional,
        riskBudgetCap,
        totalRemaining,
        pairClassRemaining,
        discoveryRemaining,
        thinBookCap ?? Number.MAX_SAFE_INTEGER,
      ),
    );

    if (allowedNotional < requestedNotional) {
      reasons.push('Capital layer mengecilkan notional untuk menjaga budget/exposure');
    }

    if (allowedNotional <= 0) {
      reasons.push('Tidak ada budget/exposure tersisa untuk entry baru');
    }

    const blocked = input.policyDecision.action !== 'ENTER' || allowedNotional <= 0;
    const allocatedNotional = blocked ? 0 : allowedNotional;

    const capitalPlan: PortfolioCapitalPlan = {
      policySizeIntentMultiplier: input.policyDecision.sizeMultiplier,
      baseEntryCapitalIdr: settings.baseEntryCapitalIdr,
      policyIntentNotionalIdr: requestedNotional,
      riskBudgetCapIdr: riskBudgetCap,
      thinBookCapIdr: thinBookCap,
      allowedNotionalIdr: allowedNotional,
      cappedNotionalIdr: Math.max(0, requestedNotional - allowedNotional),
      allocatedNotionalIdr: allocatedNotional,
      blocked,
      reasons,
      exposure: {
        totalDeployedCapitalIdr: totalDeployed,
        totalRemainingCapitalIdr: totalRemaining,
        pairClass: {
          key: currentPairClass,
          usedNotionalIdr: currentPairClassExposure,
          capNotionalIdr: pairClassCap,
          remainingNotionalIdr: pairClassRemaining,
        },
        discoveryBucket: {
          key: currentBucket,
          usedNotionalIdr: currentBucketExposure,
          capNotionalIdr: discoveryCap,
          remainingNotionalIdr: discoveryRemaining,
        },
      },
    };

    return {
      capitalPlan,
      capitalContext: {
        policyIntentNotionalIdr: capitalPlan.policyIntentNotionalIdr,
        allocatedNotionalIdr: capitalPlan.allocatedNotionalIdr,
        cappedNotionalIdr: capitalPlan.cappedNotionalIdr,
        blocked: capitalPlan.blocked,
        reasons: capitalPlan.reasons,
        pairClassBucket: capitalPlan.exposure.pairClass.key,
        discoveryBucket: capitalPlan.exposure.discoveryBucket.key,
      },
    };
  }

  finalizeRuntimeCapital(
    input: {
      initialPlan: PortfolioCapitalPlan;
      initialContext: RuntimeCandidateCapitalContext;
      finalPolicyAction: 'ENTER' | 'SKIP' | 'WAIT';
      riskAllowed: boolean;
      riskReasons: string[];
      finalAllocatedNotionalIdr?: number;
    },
  ): {
    capitalPlan: PortfolioCapitalPlan;
    capitalContext: RuntimeCandidateCapitalContext;
  } {
    const runtimeBlocked = input.finalPolicyAction !== 'ENTER' || !input.riskAllowed;
    const finalAllocatedNotionalIdr = runtimeBlocked
      ? 0
      : Math.max(0, input.finalAllocatedNotionalIdr ?? input.initialPlan.allocatedNotionalIdr);
    const blockedReasons = runtimeBlocked
      ? [
          ...input.initialPlan.reasons,
          input.finalPolicyAction !== 'ENTER'
            ? `Final runtime blocked by policy action=${input.finalPolicyAction}`
            : 'Final runtime blocked by risk guardrail',
          ...input.riskReasons,
        ]
      : input.initialPlan.reasons;

    const capitalPlan: PortfolioCapitalPlan = {
      ...input.initialPlan,
      allocatedNotionalIdr: finalAllocatedNotionalIdr,
      allowedNotionalIdr: runtimeBlocked ? 0 : input.initialPlan.allowedNotionalIdr,
      cappedNotionalIdr: Math.max(0, input.initialPlan.policyIntentNotionalIdr - finalAllocatedNotionalIdr),
      blocked: runtimeBlocked || input.initialPlan.blocked,
      reasons: blockedReasons,
    };

    return {
      capitalPlan,
      capitalContext: {
        ...input.initialContext,
        allocatedNotionalIdr: capitalPlan.allocatedNotionalIdr,
        cappedNotionalIdr: capitalPlan.cappedNotionalIdr,
        blocked: capitalPlan.blocked,
        reasons: capitalPlan.reasons,
      },
    };
  }
}
