import assert from 'node:assert/strict';

import { PersistenceService } from '../src/services/persistenceService';
import { StateService } from '../src/services/stateService';

async function main() {
  const persistence = new PersistenceService();
  await persistence.bootstrap();

  const state = new StateService(persistence);
  await state.load();

  const before = state.get();
  assert.equal(before.tradeCount, 0, 'initial fallback state should start at tradeCount=0 in isolated probe runtime');

  const originalSaveState = persistence.saveState.bind(persistence);

  let failWrites = true;
  persistence.saveState = async (nextState) => {
    if (failWrites) {
      throw new Error('probe-forced-write-failure');
    }
    await originalSaveState(nextState);
  };

  await assert.rejects(
    state.patch({ tradeCount: before.tradeCount + 1 }),
    /probe-forced-write-failure/,
    'state.patch must propagate persistence failures',
  );

  assert.equal(
    state.get().tradeCount,
    before.tradeCount,
    'runtime in-memory state must remain unchanged when persistence write fails',
  );

  const persistedAfterFailure = await persistence.readState();
  assert.equal(
    persistedAfterFailure.tradeCount,
    before.tradeCount,
    'persisted state must remain unchanged after rejected patch write',
  );

  failWrites = false;
  await state.patch({ tradeCount: before.tradeCount + 2 });

  assert.equal(state.get().tradeCount, before.tradeCount + 2, 'runtime state should commit after successful persistence write');
  const persistedAfterSuccess = await persistence.readState();
  assert.equal(
    persistedAfterSuccess.tradeCount,
    before.tradeCount + 2,
    'persisted state should commit same value as runtime after successful patch',
  );

  console.log('PASS state_atomicity_probe');
}

main().catch((error) => {
  console.error('FAIL state_atomicity_probe');
  console.error(error);
  process.exit(1);
});
