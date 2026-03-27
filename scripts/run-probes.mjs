import { execFile } from 'node:child_process';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const officialProbes = [
  'tests/private_api_v2_mapping_probe.ts',
  'tests/nginx_renderer_probe.ts',
  'tests/http_servers_probe.ts',
  'tests/telegram_menu_navigation_probe.ts',
  'tests/telegram_message_chunking_probe.ts',
  'tests/telegram_monitoring_state_sync_probe.ts',
  'tests/telegram_slippage_confirmation_probe.ts',
  'tests/telegram_settings_persistence_probe.ts',
  'tests/telegram_strategy_mode_probe.ts',
  'tests/telegram_manual_accounts_probe.ts',
  'tests/telegram_manual_buy_flow_probe.ts',
  'tests/telegram_manual_sell_flow_probe.ts',
  'tests/market_watcher_selection_probe.ts',
  'tests/batch_a_trade_truth_layer_probe.ts',
  'tests/discovery_anomaly_priority_probe.ts',
  'tests/discovery_bucket_allocation_probe.ts',
  'tests/discovery_major_pair_cap_probe.ts',
  'tests/discovery_market_watch_split_probe.ts',
  'tests/discovery_rejection_gate_probe.ts',
  'tests/discovery_settings_runtime_probe.ts',
  'tests/settings_discovery_normalization_probe.ts',
  'tests/discovery_scanner_settings_probe.ts',
  'tests/discovery_runtime_consumer_canonical_probe.ts',
  'tests/discovery_health_observability_probe.ts',
  'tests/discovery_score_confidence_pivot_probe.ts',
  'tests/history_outcome_grounding_probe.ts',
  'tests/prediction_contract_probe.ts',
  'tests/prediction_horizon_calibration_probe.ts',
  'tests/prediction_policy_input_probe.ts',
  'tests/runtime_prediction_policy_wiring_probe.ts',
  'tests/runtime_prediction_reachable_lane_probe.ts',
  'tests/ticker_quote_flow_features_probe.ts',
  'tests/runtime_backend_regression.ts',
  'tests/last_signals_contract_probe.ts',
  'tests/live_execution_hardening_probe.ts',
  'tests/execution_summary_failed_probe.ts',
  'tests/buy_entry_price_guard_probe.ts',
  'tests/scout_enter_route_probe.ts',
  'tests/add_on_confirm_probe.ts',
  'tests/add_on_confirm_account_scope_probe.ts',
  'tests/scout_lane_sizing_probe.ts',
  'tests/portfolio_capital_contract_probe.ts',
  'tests/policy_to_capital_sizing_probe.ts',
  'tests/portfolio_exposure_cap_probe.ts',
  'tests/portfolio_exposure_truth_persistence_probe.ts',
  'tests/thin_book_cap_probe.ts',
  'tests/runtime_capital_policy_wiring_probe.ts',
  'tests/runtime_capital_final_sync_probe.ts',
  'tests/execution_uses_final_allocated_notional_probe.ts',
  'tests/operator_capital_observability_probe.ts',
  'tests/decision_policy_semantic_sync_probe.ts',
  'tests/runtime_policy_wiring_probe.ts',
  'tests/runtime_policy_observability_probe.ts',
  'tests/runtime_policy_operator_summary_probe.ts',
  'tests/execution_runtime_final_decision_probe.ts',
  'tests/runtime_selector_prefers_scout_anomaly_probe.ts',
  'tests/runtime_selector_prefers_scout_stealth_probe.ts',
  'tests/runtime_selector_prefers_add_on_after_scout_probe.ts',
  'tests/runtime_selector_pair_priority_probe.ts',
  'tests/runtime_selector_fallback_general_probe.ts',
  'tests/runtime_selector_fallback_pair_priority_probe.ts',
  'tests/runtime_selector_monitoring_continuity_probe.ts',
  'tests/batch_d_learning_loop_probe.ts',
  'tests/chasing_entry_rejected_probe.ts',
  'tests/normal_entry_other_account_same_pair_probe.ts',
  'tests/hold_winner_while_pump_healthy_probe.ts',
  'tests/dump_exit_trigger_probe.ts',
  'tests/emergency_exit_override_probe.ts',
  'tests/runtime_exit_wiring_probe.ts',
  'tests/position_mark_pnl_correctness_probe.ts',
  'tests/live_submission_uncertain_probe.ts',
  'tests/cancel_submission_uncertain_probe.ts',
  'tests/submission_uncertain_unresolved_probe.ts',
  'tests/submission_uncertain_bounded_history_probe.ts',
  'tests/indodax_history_v2_probe.ts',
  'tests/app_lifecycle_servers_probe.ts',
  'tests/bootstrap_observability_probe.ts',
  'tests/startup_health_honesty_probe.ts',
  'tests/startup_hotlist_rehydrate_probe.ts',
  'tests/startup_corrupted_state_probe.ts',
  'tests/state_atomicity_probe.ts',
  'tests/state_replace_atomicity_probe.ts',
  'tests/scheduler_overlap_guard_probe.ts',
  'tests/callback_reconciliation_probe.ts',
  'tests/callback_security_probe.ts',
  'tests/worker_timeout_probe.ts',
  'tests/worker_production_runtime_probe.ts',
];

const manualProbes = ['tests/real_exchange_shadow_run_probe.ts'];

async function validateProbeRegistry() {
  const testFiles = (await readdir(path.resolve(repoRoot, 'tests')))
    .filter((file) => file.endsWith('.ts'))
    .map((file) => `tests/${file}`)
    .sort();

  const registered = new Set([...officialProbes, ...manualProbes]);
  const missingOnDisk = [...registered].filter((probe) => !testFiles.includes(probe));
  if (missingOnDisk.length > 0) {
    throw new Error(`Probe registry references missing file(s): ${missingOnDisk.join(', ')}`);
  }

  const unregistered = testFiles.filter((probe) => !registered.has(probe));
  if (unregistered.length > 0) {
    throw new Error(
      `Found unregistered probe file(s): ${unregistered.join(', ')}. Add them to officialProbes or manualProbes.`,
    );
  }
}

async function runProbe(probe, index) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), `cukong-probe-${index}-`));
  const appPort = String(3800 + index * 2);
  const callbackPort = String(3900 + index * 2);

  const callbackAuthMode = probe.includes('callback_security_probe')
    ? 'required'
    : process.env.INDODAX_CALLBACK_AUTH_MODE || 'disabled';

  const env = {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
    LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
    APP_NAME: process.env.APP_NAME || 'cukong-markets',
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || 'https://kangtrade.top',
    APP_BIND_HOST: process.env.APP_BIND_HOST || '127.0.0.1',
    APP_PORT: process.env.APP_PORT || appPort,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'test-telegram-token',
    TELEGRAM_ALLOWED_USER_IDS: process.env.TELEGRAM_ALLOWED_USER_IDS || '1',
    INDODAX_CALLBACK_PATH: process.env.INDODAX_CALLBACK_PATH || '/indodax/callback',
    INDODAX_CALLBACK_PORT: process.env.INDODAX_CALLBACK_PORT || callbackPort,
    INDODAX_CALLBACK_BIND_HOST: process.env.INDODAX_CALLBACK_BIND_HOST || '127.0.0.1',
    INDODAX_CALLBACK_ALLOWED_HOST: process.env.INDODAX_CALLBACK_ALLOWED_HOST || 'kangtrade.top',
    INDODAX_ENABLE_CALLBACK_SERVER: process.env.INDODAX_ENABLE_CALLBACK_SERVER || 'true',
    INDODAX_CALLBACK_AUTH_MODE: callbackAuthMode,
    INDODAX_CALLBACK_SIGNATURE_SECRET:
      process.env.INDODAX_CALLBACK_SIGNATURE_SECRET || 'probe-indodax-callback-secret',
    INDODAX_CALLBACK_SIGNATURE_HEADER:
      process.env.INDODAX_CALLBACK_SIGNATURE_HEADER || 'x-indodax-signature',
    INDODAX_CALLBACK_TIMESTAMP_HEADER:
      process.env.INDODAX_CALLBACK_TIMESTAMP_HEADER || 'x-indodax-timestamp',
    INDODAX_CALLBACK_NONCE_HEADER: process.env.INDODAX_CALLBACK_NONCE_HEADER || 'x-indodax-nonce',
    INDODAX_CALLBACK_REPLAY_WINDOW_MS: process.env.INDODAX_CALLBACK_REPLAY_WINDOW_MS || '300000',
    INDODAX_CALLBACK_MAX_SKEW_MS: process.env.INDODAX_CALLBACK_MAX_SKEW_MS || '60000',
    INDODAX_PUBLIC_BASE_URL: process.env.INDODAX_PUBLIC_BASE_URL || 'https://indodax.com/api',
    INDODAX_PRIVATE_BASE_URL: process.env.INDODAX_PRIVATE_BASE_URL || 'https://indodax.com/tapi',
    INDODAX_TRADE_API_V2_BASE_URL:
      process.env.INDODAX_TRADE_API_V2_BASE_URL || 'https://tapi.indodax.com',
    CUKONG_PREFER_DIST_WORKERS: process.env.CUKONG_PREFER_DIST_WORKERS || '1',
    DATA_DIR: dataDir,
    LOG_DIR: path.join(dataDir, 'logs'),
    TEMP_DIR: path.join(dataDir, 'tmp'),
  };

  process.stdout.write(`\n[probe] ${probe}\n`);
  const { stdout, stderr } = await execFileAsync('node', ['--import', 'tsx', probe], {
    cwd: repoRoot,
    env,
  });

  if (stdout.trim()) {
    process.stdout.write(stdout);
    if (!stdout.endsWith('\n')) {
      process.stdout.write('\n');
    }
  }

  if (stderr.trim()) {
    process.stderr.write(stderr);
    if (!stderr.endsWith('\n')) {
      process.stderr.write('\n');
    }
  }
}

async function main() {
  await validateProbeRegistry();

  if (process.argv.includes('--list')) {
    console.log('Official probes:');
    officialProbes.forEach((probe) => console.log(`- ${probe}`));
    console.log('\nManual probes (not in npm run verify):');
    manualProbes.forEach((probe) => console.log(`- ${probe}`));
    return;
  }

  if (process.argv.includes('--audit')) {
    console.log('Probe registry is valid.');
    console.log(`Official probes: ${officialProbes.length}`);
    console.log(`Manual probes: ${manualProbes.length}`);
    return;
  }

  for (const [index, probe] of officialProbes.entries()) {
    await runProbe(probe, index + 1);
  }

  console.log('\nAll probes passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
