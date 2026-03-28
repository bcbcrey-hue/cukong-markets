import type {
  BacktestRunResult,
  ExecutionSummary,
  HealthSnapshot,
  HotlistEntry,
  MarketOverview,
  OpportunityAssessment,
  OrderRecord,
  PositionRecord,
  RuntimePolicyReadModel,
  PolicyLearningReadModel,
  SignalCandidate,
  ShadowRunTelegramSummary,
  StoredAccount,
  TradeOutcomeSummary,
  TradeRecord,
  BatchBPhase2OperatorSummary,
} from '../core/types';
import { evaluateHotlistUiDecision } from '../core/hotlistDecision';

function asNum(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0';
}

function asPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function asBps(value: number): string {
  return `${value.toFixed(1)}bps`;
}

function asMaybeNum(value: number | null | undefined, digits = 4): string {
  return value === null || value === undefined ? '-' : asNum(value, digits);
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms <= 0) {
    return '-';
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

function truncate(text: string, max = 180): string {
  if (!text) {
    return '-';
  }

  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}

function hasInformativeNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function formatAgeMs(timestamp: number | null | undefined): string {
  if (!hasInformativeNumber(timestamp)) {
    return '-';
  }

  const ageMs = Date.now() - timestamp;
  if (ageMs < 0) {
    return 'clock_skew';
  }
  if (ageMs < 1_000) {
    return `${ageMs}ms`;
  }
  if (ageMs < 60_000) {
    return `${Math.floor(ageMs / 1_000)}s`;
  }
  if (ageMs < 3_600_000) {
    return `${Math.floor(ageMs / 60_000)}m`;
  }

  return `${Math.floor(ageMs / 3_600_000)}h`;
}

function compactOrderbookDebug(item: {
  spreadBps?: number;
  depthScore?: number;
  orderbookTimestamp?: number;
  timestamp: number;
}): string {
  const parts: string[] = [];

  if (hasInformativeNumber(item.spreadBps)) {
    parts.push(`spreadBps=${asBps(item.spreadBps)}`);
  }

  if (hasInformativeNumber(item.depthScore)) {
    parts.push(`depthScore=${asNum(item.depthScore, 1)}`);
  }

  if (parts.length === 0) {
    return '';
  }

  const debugTimestamp = item.orderbookTimestamp ?? item.timestamp;
  if (hasInformativeNumber(debugTimestamp)) {
    parts.push(`age=${formatAgeMs(debugTimestamp)}`);
  }

  return `debug=${parts.join(',')}`;
}

export class ReportService {
  private isHotlistEntry(
    signal: HotlistEntry | SignalCandidate | OpportunityAssessment,
  ): signal is HotlistEntry {
    return 'rank' in signal && 'recommendedAction' in signal;
  }

  private isOpportunityAssessment(
    signal: HotlistEntry | SignalCandidate | OpportunityAssessment,
  ): signal is OpportunityAssessment {
    return 'finalScore' in signal;
  }

  shadowRunStatusText(summary: ShadowRunTelegramSummary): string {
    const lines = [
      '🌘 SHADOW RUN (NON-DESTRUKTIF)',
      `- Runtime: ${summary.runtimeStatus} (${summary.runtimeDetail})`,
      `- Shadow: ${summary.shadowStatus}`,
      `- Public market: ${summary.publicMarket}`,
      `- Private auth akun: ${summary.privateAuth}`,
      `- Reconciliation/read-model: ${summary.reconciliation}`,
      `- Policy runtime decision: ${summary.policyRuntimeDecision}`,
      `- Policy vs hint consistency: ${summary.policyVsHintConsistency}`,
      `- Policy guardrail enforced: ${summary.policyGuardrailEnforced}`,
      `- Hotlist/signal/opportunity: ${summary.hotlistSignalOpportunity}`,
      `- Intelligence/spoof/pattern: ${summary.intelligenceSpoofPattern}`,
      `- Evidence archive: ${summary.evidenceArchive}`,
      `- Verdict: ${summary.verdict}`,
    ];

    if (summary.runId) {
      lines.push(`- Run ID: ${summary.runId}`);
    }
    if (summary.startedAt) {
      lines.push(`- Mulai: ${summary.startedAt}`);
    }
    if (summary.finishedAt) {
      lines.push(`- Selesai: ${summary.finishedAt}`);
    }
    if (summary.blockReason) {
      lines.push(`- Alasan blok: ${summary.blockReason}`);
    }
    if (summary.failureReason) {
      lines.push(`- Alasan gagal: ${summary.failureReason}`);
    }

    if (summary.nextSteps.length > 0) {
      lines.push('- Langkah perbaikan:');
      for (const step of summary.nextSteps) {
        lines.push(`  • ${step}`);
      }
    }

    return lines.join('\n');
  }

  batchBPhase2OperatorSummaryText(summary: BatchBPhase2OperatorSummary): string {
    return [
      '📘 BATCH B FASE 2 — SHADOW-LIVE CALIBRATION',
      `- Run ID: ${summary.runId}`,
      `- Generated: ${summary.generatedAt}`,
      ...summary.lines.map((line) => `- ${line}`),
      `- Batas jujur: ${summary.honestBoundary}`,
    ].join('\n');
  }

  hotlistText(hotlist: HotlistEntry[]): string {
    if (!hotlist.length) {
      return '🔥 Hotlist kosong.';
    }

    const lines = hotlist.slice(0, 10).map((item, index) => {
      const decision = evaluateHotlistUiDecision(item);
      const reasons = Array.isArray(item.reasons) && item.reasons.length
        ? item.reasons.join('; ')
        : 'belum ada alasan';

      const warnings = Array.isArray(item.warnings) && item.warnings.length
        ? ` | warnings=${truncate(item.warnings.join('; '), 100)}`
        : '';
      const segments = [
        `${index + 1}. ${item.pair}`,
        `score=${asNum(item.score, 1)}`,
        `status=${decision.status}`,
        `confidence=${asNum(item.confidence, 2)}`,
        `regime=${item.regime}`,
        `spread=${asPct(item.spreadPct)}`,
        `reasons=${truncate(reasons, 120)}${warnings}`,
      ];

      const debug = compactOrderbookDebug(item);
      if (debug) {
        segments.splice(6, 0, debug);
      }

      return segments.join(' | ');
    });

    return ['🔥 HOTLIST', ...lines].join('\n');
  }

  marketWatchText(input: MarketOverview | SignalCandidate[] | null): string {
    const overview = Array.isArray(input)
      ? ({
        timestamp: Date.now(),
        breadth: {
          totalPairs: input.length,
          gainers1m: input.filter((item) => item.change1m > 0).length,
          losers1m: input.filter((item) => item.change1m < 0).length,
          gainers5m: input.filter((item) => item.change5m > 0).length,
          losers5m: input.filter((item) => item.change5m < 0).length,
        },
        liquidLeaders: [...input].sort((a, b) => b.liquidityScore - a.liquidityScore).slice(0, 5),
        rotationLeaders: [...input]
          .sort((a, b) => Math.abs(b.change5m) - Math.abs(a.change5m))
          .slice(0, 5),
        watchlist: [...input].sort((a, b) => b.score - a.score).slice(0, 8),
      } satisfies MarketOverview)
      : input;

    if (!overview || overview.watchlist.length === 0) {
      return '👁️ Market watch belum berisi pair aktif.';
    }

    const breadthLine = `breadth=total:${overview.breadth.totalPairs}, g1m:${overview.breadth.gainers1m}, l1m:${overview.breadth.losers1m}, g5m:${overview.breadth.gainers5m}, l5m:${overview.breadth.losers5m}`;
    const liquidLeaders = overview.liquidLeaders.length > 0
      ? `liquid=${overview.liquidLeaders.map((item) => item.pair).join(', ')}`
      : 'liquid=-';
    const rotationSummary = overview.rotationLeaders.length > 0
      ? `rotation=${overview.rotationLeaders.map((item) => item.pair).join(', ')}`
      : 'rotation=-';

    const lines = overview.watchlist.slice(0, 8).map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `p=${asNum(item.marketPrice, 8)}`,
        `s=${asPct(item.spreadPct)}`,
        `liq=${asNum(item.liquidityScore, 1)}`,
        `Δ1m=${asPct(item.change1m)}`,
        `Δ5m=${asPct(item.change5m)}`,
      ].join(' | '),
    );

    return ['👁️ MARKET WATCH', breadthLine, liquidLeaders, rotationSummary, ...lines].join('\n');
  }

  private orderbookDebugLines(signal: {
    bestBid: number;
    bestAsk: number;
    spreadBps?: number;
    bidDepthTop10?: number;
    askDepthTop10?: number;
    depthScore?: number;
    orderbookTimestamp?: number;
    timestamp: number;
  }): string[] {
    const lines: string[] = [];
    const bidAskParts: string[] = [];

    if (hasInformativeNumber(signal.bestBid)) {
      bidAskParts.push(`bestBid=${asNum(signal.bestBid, 8)}`);
    }
    if (hasInformativeNumber(signal.bestAsk)) {
      bidAskParts.push(`bestAsk=${asNum(signal.bestAsk, 8)}`);
    }
    if (bidAskParts.length > 0) {
      lines.push(`Orderbook: ${bidAskParts.join(' | ')}`);
    }

    const depthParts: string[] = [];
    if (hasInformativeNumber(signal.spreadBps)) {
      depthParts.push(`spreadBps=${asBps(signal.spreadBps)}`);
    }
    if (hasInformativeNumber(signal.bidDepthTop10)) {
      depthParts.push(`bidDepthTop10=${asNum(signal.bidDepthTop10, 4)}`);
    }
    if (hasInformativeNumber(signal.askDepthTop10)) {
      depthParts.push(`askDepthTop10=${asNum(signal.askDepthTop10, 4)}`);
    }
    if (hasInformativeNumber(signal.depthScore)) {
      depthParts.push(`depthScore=${asNum(signal.depthScore, 1)}`);
    }
    if (depthParts.length > 0) {
      lines.push(`Depth: ${depthParts.join(' | ')}`);
    }

    const debugTimestamp = signal.orderbookTimestamp ?? signal.timestamp;
    if (hasInformativeNumber(debugTimestamp)) {
      lines.push(
        `Orderbook ts: ${new Date(debugTimestamp).toISOString()} | age=${formatAgeMs(debugTimestamp)}`,
      );
    }

    return lines.length > 0 ? lines : ['Orderbook debug: tidak tersedia di runtime path.'];
  }

  signalBreakdownText(
    signal: HotlistEntry | SignalCandidate | OpportunityAssessment,
  ): string {
    const asReasonLine = (items: string[]): string => `Reasons: ${truncate(items.join('; '), 240)}`;
    const asWarningLine = (items: string[]): string =>
      items.length > 0 ? `Warnings: ${truncate(items.join('; '), 220)}` : 'Warnings: -';

    if (this.isHotlistEntry(signal)) {
      const decision = evaluateHotlistUiDecision(signal);
      return [
        `Pair: ${signal.pair}`,
        `Score: ${asNum(signal.score, 2)}`,
        `Pump probability: ${(signal.pumpProbability * 100).toFixed(1)}%`,
        `Trap probability: ${(signal.trapProbability * 100).toFixed(1)}%`,
        `Confidence: ${(signal.confidence * 100).toFixed(1)}%`,
        `Timing: ${signal.entryTiming.state} (${signal.entryTiming.reason})`,
        `Action: ${signal.recommendedAction}`,
        `Edge valid: ${signal.edgeValid ? 'YA' : 'TIDAK'}`,
        `Status: ${decision.status}`,
        `Gate reason: ${truncate(decision.reason, 180)}`,
        `Price: ${asNum(signal.marketPrice, 8)}`,
        `Spread: ${asPct(signal.spreadPct)}`,
        ...this.orderbookDebugLines(signal),
        asReasonLine(signal.reasons),
        asWarningLine(signal.warnings),
        `History: ${truncate(signal.historicalMatchSummary, 180)}`,
      ].join('\n');
    }

    if (this.isOpportunityAssessment(signal)) {
      return [
        `Pair: ${signal.pair}`,
        `Final score: ${asNum(signal.finalScore, 2)}`,
        `Pump probability: ${(signal.pumpProbability * 100).toFixed(1)}%`,
        `Trap probability: ${(signal.trapProbability * 100).toFixed(1)}%`,
        `Confidence: ${(signal.confidence * 100).toFixed(1)}%`,
        `Timing: ${signal.entryTiming.state} (${signal.entryTiming.reason})`,
        `Hint action: ${signal.recommendedAction}`,
        ...this.orderbookDebugLines(signal),
        asReasonLine(signal.reasons),
        asWarningLine(signal.warnings),
        `History: ${truncate(signal.historicalMatchSummary, 180)}`,
      ].join('\n');
    }

    return [
      `Pair: ${signal.pair}`,
      `Score: ${asNum(signal.score, 2)}`,
      `Confidence: ${(signal.confidence * 100).toFixed(1)}%`,
      `Regime: ${signal.regime}`,
      `Price: ${asNum(signal.marketPrice, 8)}`,
      `Spread: ${asPct(signal.spreadPct)}`,
      ...this.orderbookDebugLines(signal),
      asReasonLine(signal.reasons),
      asWarningLine(signal.warnings),
    ].join('\n');
  }

  statusText(params: {
    health: HealthSnapshot;
    activeAccounts: number;
    topSignal?: HotlistEntry | SignalCandidate;
    topOpportunity?: OpportunityAssessment;
    runtimePolicyDecision?: RuntimePolicyReadModel | null;
    runtimePolicyLearning?: PolicyLearningReadModel | null;
  }): string {
    const lines = [
      '🤖 BOT STATUS',
      `status=${params.health.status}`,
      `runtime=${params.health.runtimeStatus}`,
      `scanner=${params.health.scannerRunning ? 'on' : 'off'}`,
      `telegram=${params.health.telegramRunning ? 'on' : 'off'}`,
      `telegramConfigured=${params.health.telegramConnection.configured}`,
      `telegramLaunched=${params.health.telegramConnection.launched}`,
      `telegramConnected=${params.health.telegramConnection.connected}`,
      `telegramLastConnectionStatus=${params.health.telegramConnection.lastConnectionStatus}`,
      `telegramLastLaunchErrorType=${params.health.telegramConnection.lastLaunchErrorType}`,
      `telegramLastLaunchError=${truncate(params.health.telegramConnection.lastLaunchError ?? '-', 120)}`,
      `telegramBotId=${params.health.telegramConnection.botId ?? '-'}`,
      `telegramBotUsername=${params.health.telegramConnection.botUsername ?? '-'}`,
      `telegramBotFirstName=${params.health.telegramConnection.botFirstName ?? '-'}`,
      `telegramBotIsBot=${
        params.health.telegramConnection.botIsBot === null
          ? '-'
          : params.health.telegramConnection.botIsBot
      }`,
      `telegramLastConnectedAt=${params.health.telegramConnection.lastConnectedAt ?? '-'}`,
      `telegramLastLaunchSuccessAt=${params.health.telegramConnection.lastLaunchSuccessAt ?? '-'}`,
      `telegramAllowedUsersCount=${params.health.telegramConnection.allowedUsersCount}`,
      `trading=${params.health.tradingEnabled ? 'on' : 'off'}`,
      `execution=${params.health.executionMode}`,
      `accounts=${params.activeAccounts}`,
      `pairs=${params.health.activePairsTracked}`,
    ];

    if (params.topOpportunity) {
      lines.push(
        `topOpportunity=${params.topOpportunity.pair} score=${asNum(params.topOpportunity.finalScore, 1)} pump=${(params.topOpportunity.pumpProbability * 100).toFixed(1)}% hintAction=${params.topOpportunity.recommendedAction}`,
      );
    } else if (params.topSignal) {
      lines.push(
        `topSignal=${params.topSignal.pair} score=${asNum(params.topSignal.score, 1)} confidence=${(params.topSignal.confidence * 100).toFixed(1)}%`,
      );
    }

    if (params.runtimePolicyDecision) {
      const policy = params.runtimePolicyDecision;
      lines.push(
        `runtimePolicy pair=${policy.pair} action=${policy.action} lane=${policy.entryLane} size=${asNum(policy.sizeMultiplier, 2)} aggressiveness=${policy.aggressiveness} risk=${policy.riskAllowed ? 'ALLOWED' : 'BLOCKED'}`,
      );
      if (policy.capital) {
        lines.push(
          `runtimePolicyCapital intent=${asNum(policy.capital.policyIntentNotionalIdr, 0)} allocated=${asNum(policy.capital.allocatedNotionalIdr, 0)} capped=${asNum(policy.capital.cappedNotionalIdr, 0)} blocked=${policy.capital.blocked} pairClass=${policy.capital.pairClassBucket} bucket=${policy.capital.discoveryBucket}`,
        );
        lines.push(`runtimePolicyCapitalReasons=${truncate(policy.capital.reasons.join('; ') || '-', 220)}`);
      }
      if (policy.predictionContext) {
        lines.push(
          `runtimePolicyPrediction target=${policy.predictionContext.target} horizon=${policy.predictionContext.horizonLabel} strength=${policy.predictionContext.strength} confidence=${asNum(policy.predictionContext.confidence, 2)} direction=${policy.predictionContext.direction} calibration=${policy.predictionContext.calibrationTag}`,
        );
      }
      lines.push(`runtimePolicyReasons=${truncate(policy.reasons.join('; ') || '-', 220)}`);
      lines.push(`runtimePolicyRiskReasons=${truncate(policy.riskReasons.join('; ') || '-', 220)}`);
      lines.push(`runtimePolicyUpdatedAt=${policy.updatedAt}`);
    }

    if (params.runtimePolicyLearning) {
      const learning = params.runtimePolicyLearning;
      lines.push(
        `policyLearning status=${learning.tuned ? 'TUNED' : 'NO_OP'} eligible=${learning.eligibleSamples} resolved=${learning.resolvedSamples} total=${learning.totalRecords}`,
      );
      lines.push(
        `policyLearningLaneSample default=${learning.laneSample.DEFAULT} scout=${learning.laneSample.SCOUT} addOn=${learning.laneSample.ADD_ON_CONFIRM}`,
      );
      lines.push(`policyLearningReasons=${truncate(learning.reasons.join('; ') || '-', 220)}`);
      if (learning.noOpReason) {
        lines.push(`policyLearningNoOp=${truncate(learning.noOpReason, 220)}`);
      }
      if (learning.changes.length > 0) {
        lines.push(
          `policyLearningChanges=${truncate(learning.changes.map((item) => `${item.key}:${asNum(item.before, 2)}->${asNum(item.after, 2)} (d=${asNum(item.delta, 2)})`).join('; '), 220)}`,
        );
      }
      lines.push(`policyLearningUpdatedAt=${learning.lastEvaluatedAt}`);
    }

    lines.push(`notes=${truncate((params.health.notes ?? []).join('; ') || '-', 220)}`);
    lines.push(`updated=${params.health.updatedAt}`);

    return lines.join('\n');
  }

  positionsText(positions: PositionRecord[]): string {
    if (!positions.length) {
      return '📦 Belum ada posisi.';
    }

    const lines = positions.map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `status=${item.status}`,
        `qty=${asNum(item.quantity, 8)}`,
        `entry=${asNum(item.entryPrice, 8)}`,
        `mark=${asNum(item.currentPrice, 8)}`,
        `unreal=${asNum(item.unrealizedPnl, 2)}`,
        `real=${asNum(item.realizedPnl, 2)}`,
      ].join(' | '),
    );

    return ['📦 POSITIONS', ...lines].join('\n');
  }

  ordersText(orders: OrderRecord[]): string {
    if (!orders.length) {
      return '🧾 Tidak ada order.';
    }

    const lines = orders.slice(0, 15).map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `${item.side.toUpperCase()} ${item.status}`,
        `qty=${asNum(item.quantity, 8)}`,
        `price=${asNum(item.price, 8)}`,
        `filled=${asNum(item.filledQuantity, 8)}`,
      ].join(' | '),
    );

    return ['🧾 ORDERS', ...lines].join('\n');
  }

  tradesText(trades: TradeRecord[]): string {
    if (!trades.length) {
      return '📝 Belum ada trade.';
    }

    const lines = trades.slice(-10).reverse().map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        item.side.toUpperCase(),
        `qty=${asNum(item.quantity, 8)}`,
        `price=${asNum(item.price, 8)}`,
        `pnl=${asNum(item.realizedPnl, 2)}`,
        `at=${item.executedAt}`,
      ].join(' | '),
    );

    return ['📝 RECENT TRADES', ...lines].join('\n');
  }

  accountsText(accounts: StoredAccount[]): string {
    if (!accounts.length) {
      return '👤 Belum ada account tersimpan.';
    }

    const lines = accounts.map((item, index) =>
      [
        `${index + 1}. ${item.name}`,
        item.enabled ? 'enabled' : 'disabled',
        item.isDefault ? 'default' : 'secondary',
        `id=${item.id}`,
      ].join(' | '),
    );

    return ['👤 ACCOUNTS', ...lines].join('\n');
  }

  intelligenceReportText(opportunities: OpportunityAssessment[]): string {
    if (!opportunities.length) {
      return '🧠 Belum ada opportunity aktif.';
    }

    const lines = opportunities.slice(0, 8).map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `final=${asNum(item.finalScore, 1)}`,
        `pump=${(item.pumpProbability * 100).toFixed(1)}%`,
        `trap=${(item.trapProbability * 100).toFixed(1)}%`,
        `timing=${item.entryTiming.state}`,
        `hintAction=${item.recommendedAction}`,
      ].join(' | '),
    );

    return ['🧠 INTELLIGENCE REPORT', ...lines].join('\n');
  }

  spoofRadarText(opportunities: OpportunityAssessment[]): string {
    const risky = opportunities
      .filter((item) => item.spoofRisk >= 0.35 || item.trapProbability >= 0.35)
      .sort((a, b) => b.spoofRisk - a.spoofRisk);

    if (!risky.length) {
      return '🕳️ Spoof radar bersih. Belum ada pair dengan spoof/trap risk tinggi.';
    }

    const lines = risky.slice(0, 8).map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `spoof=${(item.spoofRisk * 100).toFixed(1)}%`,
        `trap=${(item.trapProbability * 100).toFixed(1)}%`,
        `warning=${truncate(item.warnings.join('; ') || '-', 120)}`,
      ].join(' | '),
    );

    return ['🕳️ SPOOF RADAR', ...lines].join('\n');
  }

  patternMatchText(opportunities: OpportunityAssessment[]): string {
    if (!opportunities.length) {
      return '🧬 Belum ada pattern match aktif.';
    }

    const lines = opportunities.slice(0, 8).map((item, index) =>
      [
        `${index + 1}. ${item.pair}`,
        `regime=${item.marketRegime}`,
        `pattern=${truncate(item.historicalMatchSummary, 120)}`,
      ].join(' | '),
    );

    return ['🧬 PATTERN MATCH', ...lines].join('\n');
  }

  backtestSummaryText(result: BacktestRunResult | null): string {
    if (!result) {
      return '🧪 Belum ada hasil backtest tersimpan.';
    }

    return [
      '🧪 BACKTEST SUMMARY',
      `runId=${result.runId}`,
      `pairs=${result.pairsTested.join(', ') || '-'}`,
      `signals=${result.signalsGenerated}`,
      `entries=${result.entriesTaken}`,
      `exits=${result.exitsTaken}`,
      `wins=${result.wins}`,
      `losses=${result.losses}`,
      `netPnl=${asNum(result.netPnl, 2)}`,
      `notes=${truncate(result.notes.join('; ') || '-', 220)}`,
    ].join('\n');
  }

  executionSummaryText(summary: ExecutionSummary): string {
    const lines = [
      '🧾 EXECUTION SUMMARY',
      `account=${summary.account}`,
      `pair=${summary.pair}`,
      `side=${summary.side.toUpperCase()}`,
      `status=${summary.status}`,
      `accuracy=${summary.accuracy}`,
      `reference=${asMaybeNum(summary.referencePrice, 8)}`,
      `intended=${asNum(summary.intendedOrderPrice, 8)}`,
      `avgFill=${asMaybeNum(summary.averageFillPrice, 8)}`,
      `filledQty=${asNum(summary.filledQuantity, 8)}`,
      `filledNotional=${asNum(summary.filledNotional, 2)}`,
      `fee=${asMaybeNum(summary.fee, 8)}${summary.feeAsset ? ` ${summary.feeAsset}` : ''}`,
      `exchangeOrderId=${summary.exchangeOrderId ?? '-'}`,
      `slippageVsRef=${summary.slippageVsReferencePricePct === null ? '-' : asPct(summary.slippageVsReferencePricePct)}`,
      `execStress=${summary.executionPlan?.stressMode ?? '-'}`,
      `execStyle=${summary.executionPlan?.orderStyle ?? '-'}`,
      `slippagePlan=${summary.executionPlan ? `${asNum(summary.executionPlan.baselineSlippageBps, 0)}->${asNum(summary.executionPlan.finalSlippageBps, 0)} bps` : '-'}`,
      `partialPlan=${summary.executionPlan ? `${summary.executionPlan.partialFillExpected ? 'yes' : 'no'} ratio=${asNum(summary.executionPlan.partialFillRatio, 2)}` : '-'}`,
      `planReason=${summary.executionPlan ? truncate(summary.executionPlan.slippageReasons.join(',') || '-', 120) : '-'}`,
      `timestamp=${summary.timestamp}`,
      `reason=${truncate(summary.reason || '-', 180)}`,
    ];

    if (summary.accuracy === 'UNCERTAIN_LIVE') {
      lines.push('operatorAction=Submission masih ambiguous; jangan entry ulang pair/account ini sampai reconciled.');
    } else if (summary.accuracy === 'UNRESOLVED_LIVE') {
      lines.push('operatorAction=WAJIB cek langsung di exchange (openOrders + history) sebelum cancel/manual close.');
    }

    return lines.join('\n');
  }

  tradeOutcomeSummaryText(summary: TradeOutcomeSummary): string {
    return [
      '📈 TRADE OUTCOME SUMMARY',
      `account=${summary.account}`,
      `pair=${summary.pair}`,
      `accuracy=${summary.accuracy}`,
      `entryAverage=${asMaybeNum(summary.entryAverage, 8)}`,
      `exitAverage=${asMaybeNum(summary.exitAverage, 8)}`,
      `totalQuantity=${asNum(summary.totalQuantity, 8)}`,
      `totalFee=${asMaybeNum(summary.totalFee, 8)}`,
      `grossPnl=${asMaybeNum(summary.grossPnl, 2)}`,
      `netPnl=${asMaybeNum(summary.netPnl, 2)}`,
      `return=${summary.returnPercentage === null ? '-' : asPct(summary.returnPercentage)}`,
      `hold=${formatDuration(summary.holdDurationMs)}`,
      `closeReason=${truncate(summary.closeReason, 140)}`,
      `timestamp=${summary.timestamp}`,
    ].join('\n');
  }

  healthText(health: HealthSnapshot): string {
    return this.statusText({
      health,
      activeAccounts: 0,
    });
  }

  simpleOk(message: string): string {
    return `✅ ${message}`;
  }

  simpleWarn(message: string): string {
    return `⚠️ ${message}`;
  }

  simpleError(message: string): string {
    return `❌ ${message}`;
  }
}
