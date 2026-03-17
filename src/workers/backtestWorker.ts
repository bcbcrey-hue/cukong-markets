import { parentPort } from 'node:worker_threads';
import {
  simulateBacktestReplay,
  type SimulateBacktestInput,
} from '../domain/backtest/backtestEngine';

parentPort?.on(
  'message',
  async (message: { id: string; payload: SimulateBacktestInput }) => {
    try {
      const result = await simulateBacktestReplay(message.payload);
      parentPort?.postMessage({ id: message.id, result });
    } catch (error) {
      parentPort?.postMessage({
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
);