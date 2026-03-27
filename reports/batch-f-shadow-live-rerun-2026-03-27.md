# Batch F Shadow-Live Rerun Evidence (2026-03-27 UTC)

## Scope
- Command rerun: `npm run verify:shadow-live`
- Runtime target: real exchange shadow-live probe (`tests/real_exchange_shadow_run_probe.ts`)
- Constraint respected: no logic change on DecisionPolicyEngine / RiskEngine / ExecutionEngine.

## Environment used
- API credential env injected at runtime (not persisted to repository files).
- `RUN_REAL_EXCHANGE_SHADOW=1` is set by script `verify:shadow-live` in `package.json`.

## Command executed
```bash
API_KEY=*** API_SECRET=*** TELEGRAM_BOT_TOKEN=*** TELEGRAM_ALLOWED_USER_IDS=*** npm run verify:shadow-live
```

## Observed output summary
- Probe started and reached Indodax public ticker call lane (`label: tickers`).
- First attempt logged transport error with `AggregateError [ENETUNREACH]`.
- Log evidence captured in `artifacts_shadow_live.log`.
- Final clean JSON evidence block + `PASS real_exchange_shadow_run_probe` did not appear in this environment.

## Conclusion
- Current environment still exhibits network reachability blocker to exchange endpoint.
- Runtime buy/sell shadow-live Batch F final proof is **not complete** in this rerun.
