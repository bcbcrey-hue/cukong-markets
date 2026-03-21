import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { IndodaxCallbackServer } from '../src/integrations/indodax/callbackServer';
import { JournalService } from '../src/services/journalService';
import { PersistenceService } from '../src/services/persistenceService';

function signPayload(body: string, timestamp: string, nonce: string): string {
  return createHmac(
    'sha256',
    process.env.INDODAX_CALLBACK_SIGNATURE_SECRET ?? 'probe-indodax-callback-secret',
  )
    .update(timestamp)
    .update('.')
    .update(nonce)
    .update('.')
    .update(body)
    .digest('hex');
}

async function sendCallback(
  server: IndodaxCallbackServer,
  payload: Record<string, unknown>,
  options?: {
    tamperedBody?: string;
    timestamp?: string;
    nonce?: string;
    signatureOverride?: string;
  },
) {
  const body = JSON.stringify(payload);
  const timestamp = options?.timestamp ?? String(Date.now());
  const nonce = options?.nonce ?? randomUUID();
  const signature = options?.signatureOverride ?? signPayload(body, timestamp, nonce);

  const requestBody = options?.tamperedBody ?? body;
  return fetch(`http://127.0.0.1:${server.getPort()}${process.env.INDODAX_CALLBACK_PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-host': process.env.INDODAX_CALLBACK_ALLOWED_HOST ?? 'kangtrade.top',
      [process.env.INDODAX_CALLBACK_SIGNATURE_HEADER ?? 'x-indodax-signature']: signature,
      [process.env.INDODAX_CALLBACK_TIMESTAMP_HEADER ?? 'x-indodax-timestamp']: timestamp,
      [process.env.INDODAX_CALLBACK_NONCE_HEADER ?? 'x-indodax-nonce']: nonce,
    },
    body: requestBody,
  });
}

async function main() {
  const tempDataDir = process.env.DATA_DIR;
  assert.ok(tempDataDir, 'DATA_DIR must be provided for isolated test run');

  await fs.rm(tempDataDir, { recursive: true, force: true });
  await fs.mkdir(path.resolve(tempDataDir), { recursive: true });

  const persistence = new PersistenceService();
  await persistence.bootstrap();
  const journal = new JournalService(persistence);
  await journal.load();

  let acceptedCount = 0;
  const callbackServer = new IndodaxCallbackServer(persistence, journal, async () => {
    acceptedCount += 1;
  });

  try {
    await callbackServer.start();

    const okResponse = await sendCallback(callbackServer, { order_id: 'OK-1', pair: 'matic_idr' });
    assert.equal(okResponse.status, 200, 'valid callback must be accepted');
    assert.equal(await okResponse.text(), 'ok', 'valid callback response must be ok');
    assert.equal(acceptedCount, 1, 'reconciliation handler should execute for valid callback');

    const badSignature = await sendCallback(
      callbackServer,
      { order_id: 'BAD-SIG' },
      { signatureOverride: 'deadbeef' },
    );
    assert.equal(badSignature.status, 403, 'invalid signature must be rejected');

    const tamperedBody = await sendCallback(
      callbackServer,
      { order_id: 'TAMPERED', amount: 10 },
      { tamperedBody: JSON.stringify({ order_id: 'TAMPERED', amount: 999 }) },
    );
    assert.equal(tamperedBody.status, 403, 'tampered body must be rejected');

    const expiredTimestamp = String(Date.now() - 10 * 60 * 1000);
    const expired = await sendCallback(callbackServer, { order_id: 'EXPIRED' }, { timestamp: expiredTimestamp });
    assert.equal(expired.status, 403, 'expired timestamp must be rejected');

    const skewFutureTimestamp = String(Date.now() + 5 * 60 * 1000);
    const skewed = await sendCallback(callbackServer, { order_id: 'SKEWED' }, { timestamp: skewFutureTimestamp });
    assert.equal(skewed.status, 403, 'timestamp skew beyond limit must be rejected');

    const replayTimestamp = String(Date.now());
    const replayNonce = randomUUID();
    const replayFirst = await sendCallback(
      callbackServer,
      { order_id: 'REPLAY-1' },
      { timestamp: replayTimestamp, nonce: replayNonce },
    );
    assert.equal(replayFirst.status, 200, 'first nonce use must be accepted');
    const replaySecond = await sendCallback(
      callbackServer,
      { order_id: 'REPLAY-2' },
      { timestamp: replayTimestamp, nonce: replayNonce },
    );
    assert.equal(replaySecond.status, 403, 'nonce reuse must be rejected');

    assert.equal(acceptedCount, 2, 'reconciliation handler should not run for rejected callbacks');

    const events = await persistence.readIndodaxCallbackEvents();
    assert.equal(events.length, 7, 'all callback attempts must be persisted');
    const reasons = events.map((event) => event.reason ?? 'accepted');
    assert.ok(reasons.includes('signature_invalid'), 'must record signature_invalid reason');
    assert.ok(reasons.includes('timestamp_expired'), 'must record timestamp_expired reason');
    assert.ok(reasons.includes('timestamp_skew_exceeded'), 'must record timestamp_skew_exceeded reason');
    assert.ok(reasons.includes('nonce_reused'), 'must record nonce_reused reason');

    console.log('PASS callback_security_probe');
  } finally {
    await callbackServer.stop();
  }
}

main().catch((error) => {
  console.error('FAIL callback_security_probe');
  console.error(error);
  process.exit(1);
});
