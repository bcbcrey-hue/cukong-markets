import assert from 'node:assert/strict';

import { PersistenceService } from '../src/services/persistenceService';
import { StateService } from '../src/services/stateService';

async function main() {
  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const state = new StateService(persistence);
  await state.load();

  const before = state.get();
  const originalSaveState = persistence.saveState.bind(persistence);

  let failWrites = true;
  persistence.saveState = async (nextState) => {
    if (failWrites) {
      throw new Error('probe-forced-replace-write-failure');
    }
    await originalSaveState(nextState);
  };

  const replaceCandidate = {
    ...before,
    status: 'RUNNING' as const,
    tradeCount: before.tradeCount + 5,
  };

  await assert.rejects(
    state.replace(replaceCandidate),
    /probe-forced-replace-write-failure/,
    'state.replace must propagate persistence failures',
  );

  assert.equal(
    state.get().status,
    before.status,
    'runtime in-memory status must remain unchanged when replace write fails',
  );
  assert.equal(
    state.get().tradeCount,
    before.tradeCount,
    'runtime in-memory tradeCount must remain unchanged when replace write fails',
  );

  const persistedAfterFailure = await persistence.readState();
  assert.equal(
    persistedAfterFailure.status,
    before.status,
    'persisted status must remain unchanged after rejected replace write',
  );
  assert.equal(
    persistedAfterFailure.tradeCount,
    before.tradeCount,
    'persisted tradeCount must remain unchanged after rejected replace write',
  );

  failWrites = false;
  await state.replace(replaceCandidate);

  assert.equal(state.get().status, 'RUNNING', 'runtime status should commit after successful replace write');
  assert.equal(state.get().tradeCount, before.tradeCount + 5, 'runtime tradeCount should commit after successful replace write');

  const persistedAfterSuccess = await persistence.readState();
  assert.equal(
    persistedAfterSuccess.status,
    'RUNNING',
    'persisted status should match runtime after successful replace',
  );
  assert.equal(
    persistedAfterSuccess.tradeCount,
    before.tradeCount + 5,
    'persisted tradeCount should match runtime after successful replace',
  );

  console.log('PASS state_replace_atomicity_probe');
}

main().catch((error) => {
  console.error('FAIL state_replace_atomicity_probe');
  console.error(error);
  process.exit(1);
});
