import type {
  BacktestRunResult,
  ExecutionSummary,
  HealthSnapshot,
  HotlistEntry,
  OpportunityAssessment,
  OrderRecord,
  PositionRecord,
  SignalCandidate,
  ShadowRunTelegramSummary,
  StoredAccount,
  TradeOutcomeSummary,
  TradeRecord,
} from '../core/types';

function asNum(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '0';
}

function asPct(value: number): string {
  return `${value.toFixed(2)}%`;
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

export class ReportService {
  shadowRunStatusText(summary: ShadowRunTelegramSummary): string {
    const lines = [
      '🌘 SHADOW RUN (NON-DESTRUKTIF)',
      `- Runtime: ${summary.runtimeStatus} (${summary.runtimeDetail})`,
      `- Shadow: ${summary.shadowStatus}`,
      `- Public market: ${summary.publicMarket}`,
      `- Private auth akun: ${summary.privateAuth}`,
      `- Reconciliation/read-model: ${summary.reconciliation}`,
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

  hotlistText(hotlist: Array<HotlistEntry | SignalCandidate>): string {
    if (!hotlist.length) {
      return '🔥 Hotlist kosong.';
    }

    const lines = hotlist.slice(0, 10).map((item, index) => {
      const reasons = Array.isArray(item.reasons) && item.reasons.length
        ? item.reasons.join('; ')
        : 'belum ada alasan';

      const warnings = Array.isArray(item.warnings) && item.warnings.length
        ? ` | warnings=${truncate(item.warnings.join('; '), 100)}`
        : '';

      return [
        `${index + 1}. ${item.pair}`,
        `score=${asNum(item.score, 1)}`,
        `confidence=${asNum(item.confidence, 2)}`,
        `regime=${item.regime}`,
        `spread=${asPct(item.spreadPct)}`,
        `reasons=${truncate(reasons, 120)}${warnings}`,
      ].join(' | ');
    });

    return ['🔥 HOTLIST', ...lines].join('\n');
  }

  marketWatchText(hotlist: Array<HotlistEntry | SignalCandidate>): string {
    if (!hotlist.length) {
      return '👁️ Market watch belum berisi pair aktif.';
    }

    const lines = hotlist.slice(0, 8).map((item, index) => {
      return [
        `${index + 1}. ${item.pair}`,
        `price=${asNum(item.marketPrice, 8)}`,
        `spread=${asPct(item.spreadPct)}`,
        `liq=${asNum(item.liquidityScore, 1)}`,
        `chg1m=${asPct(item.change1m)}`,
        `chg5m=${asPct(item.change5m)}`,
      ].join(' | ');
    });

    return ['👁️ MARKET WATCH', ...lines].join('\n');
  }

  signalBreakdownText(
    signal: HotlistEntry | SignalCandidate | OpportunityAssessment,
  ): string {
    if ('finalScore' in signal) {
      return [
        `Pair: ${signal.pair}`,
        `Final score: ${asNum(signal.finalScore, 2)}`,
        `Pump probability: ${(signal.pumpProbability * 100).toFixed(1)}%`,
        `Trap probability: ${(signal.trapProbability * 100).toFixed(1)}%`,
        `Confidence: ${(signal.confidence * 100).toFixed(1)}%`,
        `Timing: ${signal.entryTiming.state} (${signal.entryTiming.reason})`,
        `Action: ${signal.recommendedAction}`,
        `Reasons: ${truncate(signal.reasons.join('; '), 240)}`,
        `Warnings: ${truncate(signal.warnings.join('; ') || '-', 220)}`,
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
      `Reasons: ${truncate(signal.reasons.join('; '), 240)}`,
      `Warnings: ${truncate(signal.warnings.join('; ') || '-', 220)}`,
    ].join('\n');
  }

  statusText(params: {
    health: HealthSnapshot;
    activeAccounts: number;
    topSignal?: HotlistEntry | SignalCandidate;
    topOpportunity?: OpportunityAssessment;
  }): string {
    const lines = [
      '🤖 BOT STATUS',
      `status=${params.health.status}`,
      `runtime=${params.health.runtimeStatus}`,
      `scanner=${params.health.scannerRunning ? 'on' : 'off'}`,
      `telegram=${params.health.telegramRunning ? 'on' : 'off'}`,
      `trading=${params.health.tradingEnabled ? 'on' : 'off'}`,
      `execution=${params.health.executionMode}`,
      `accounts=${params.activeAccounts}`,
      `pairs=${params.health.activePairsTracked}`,
    ];

    if (params.topOpportunity) {
      lines.push(
        `topOpportunity=${params.topOpportunity.pair} score=${asNum(params.topOpportunity.finalScore, 1)} pump=${(params.topOpportunity.pumpProbability * 100).toFixed(1)}% action=${params.topOpportunity.recommendedAction}`,
      );
    } else if (params.topSignal) {
      lines.push(
        `topSignal=${params.topSignal.pair} score=${asNum(params.topSignal.score, 1)} confidence=${(params.topSignal.confidence * 100).toFixed(1)}%`,
      );
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
        `action=${item.recommendedAction}`,
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
