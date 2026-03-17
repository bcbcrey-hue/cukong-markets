export interface BacktestTradeOutcome {
  pair: string;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  pnl: number;
  openedAt: number;
  closedAt: number;
}

export interface BacktestMetrics {
  entriesTaken: number;
  exitsTaken: number;
  wins: number;
  losses: number;
  netPnl: number;
}

export function calculateBacktestMetrics(
  outcomes: BacktestTradeOutcome[],
): BacktestMetrics {
  const wins = outcomes.filter((item) => item.pnl > 0).length;
  const losses = outcomes.filter((item) => item.pnl <= 0).length;
  const netPnl = outcomes.reduce((sum, item) => sum + item.pnl, 0);

  return {
    entriesTaken: outcomes.length,
    exitsTaken: outcomes.length,
    wins,
    losses,
    netPnl,
  };
}