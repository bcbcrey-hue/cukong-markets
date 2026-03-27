import assert from 'node:assert/strict';

import { ReportService } from '../src/services/reportService';
import { createDefaultHealth } from '../src/services/persistenceService';

const report = new ReportService();

const text = report.statusText({
  health: createDefaultHealth(),
  activeAccounts: 1,
  runtimePolicyDecision: {
    pair: 'obs_idr',
    action: 'ENTER',
    reasons: ['policy ok'],
    entryLane: 'DEFAULT',
    sizeMultiplier: 1,
    aggressiveness: 'NORMAL',
    riskAllowed: true,
    riskReasons: [],
    capital: {
      policyIntentNotionalIdr: 150_000,
      allocatedNotionalIdr: 90_000,
      cappedNotionalIdr: 60_000,
      blocked: false,
      reasons: ['thin-book cap aktif'],
      pairClassBucket: 'MID',
      discoveryBucket: 'ANOMALY',
    },
    updatedAt: new Date().toISOString(),
  },
});

assert.ok(text.includes('runtimePolicyCapital intent='));
assert.ok(text.includes('runtimePolicyCapitalReasons='));
assert.ok(text.includes('allocated=90000'));
console.log('operator_capital_observability_probe: ok');
