import assert from 'node:assert/strict';

import { PrivateApi } from '../src/integrations/indodax/privateApi';

async function main() {
  const originalFetch = global.fetch;
  const calledRequests: Array<{ url: string; headers: Record<string, string> }> = [];

  try {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      calledRequests.push({ url, headers });

      if (url.includes('/api/v2/order/histories')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                orderId: '123',
                clientOrderId: 'client-1',
                symbol: 'btcidr',
                side: 'BUY',
                status: 'FILLED',
                price: '100',
                oriQty: '2',
                executedQty: '2',
                submitTime: 1700000000,
                finishTime: 1700000001,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response(
        JSON.stringify({
          data: [
            {
              tradeId: '456',
              orderId: '123',
              clientOrderId: 'client-1',
              symbol: 'btcidr',
              price: '101',
              qty: '2',
              commission: '1',
              commissionAsset: 'idr',
              isBuyer: true,
              time: 1700000002,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof global.fetch;

    const api = new PrivateApi({
      baseUrl: 'https://indodax.com/tapi',
      tradeApiV2BaseUrl: 'https://tapi.indodax.com',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    });

    const orderHistory = await api.orderHistoriesV2({
      pair: 'btc_idr',
      startTime: 1699999999000,
      endTime: 1700000009000,
      limit: 50,
      sort: 'asc',
    });
    const myTrades = await api.myTradesV2({
      pair: 'btc_idr',
      orderId: '123',
      limit: 50,
      sort: 'asc',
    });

    assert.equal(calledRequests.length, 2, 'Both v2 endpoints must be requested');
    assert.match(calledRequests[0]?.url ?? '', /^https:\/\/tapi\.indodax\.com\/api\/v2\/order\/histories/, 'order history must use v2 endpoint base and path');
    assert.match(calledRequests[1]?.url ?? '', /^https:\/\/tapi\.indodax\.com\/api\/v2\/myTrades/, 'trade history must use v2 endpoint base and path');
    assert.match(calledRequests[0]?.url ?? '', /symbol=btcidr/, 'order history must send symbol query');
    assert.match(calledRequests[0]?.url ?? '', /startTime=1699999999000/, 'order history must send explicit startTime');
    assert.match(calledRequests[0]?.url ?? '', /endTime=1700000009000/, 'order history must send explicit endTime');
    assert.doesNotMatch(calledRequests[0]?.url ?? '', /orderId=123/, 'order history must not send unsupported orderId query');
    assert.match(calledRequests[1]?.url ?? '', /orderId=123/, 'myTrades must send orderId query');
    assert.equal(calledRequests[0]?.headers['x-apikey'], 'test-key', 'v2 requests must send X-APIKEY header');
    assert.ok(calledRequests[0]?.headers.sign, 'v2 requests must send signature header');

    assert.equal(orderHistory.return?.orders?.[0]?.order_id, '123', 'v2 order history must map id -> order_id');
    assert.equal(orderHistory.return?.orders?.[0]?.order_btc, '2', 'v2 order history must map quantity to order_<asset>');
    assert.equal(orderHistory.return?.orders?.[0]?.remain_btc, '0', 'v2 order history must map remaining to remain_<asset>');
    assert.equal(orderHistory.return?.orders?.[0]?.type, 'buy', 'v2 order history must normalize side casing');
    assert.equal(orderHistory.return?.orders?.[0]?.client_order_id, 'client-1', 'v2 order history must preserve client order id');

    const firstTrade = Array.isArray(myTrades.return?.trades) ? myTrades.return?.trades[0] : undefined;
    assert.equal(firstTrade?.order_id, '123', 'v2 myTrades must preserve order_id');
    assert.equal(firstTrade?.btc, '2', 'v2 myTrades must map quantity to base asset field');
    assert.equal(firstTrade?.fee_idr, '1', 'v2 myTrades must map fee field to fee_<asset>');
    assert.equal(firstTrade?.type, 'buy', 'v2 myTrades must infer buy/sell from v2 payload');
    assert.equal(firstTrade?.client_order_id, 'client-1', 'v2 myTrades must preserve client order id');

    console.log('PASS private_api_v2_mapping_probe');
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error('FAIL private_api_v2_mapping_probe');
  console.error(error);
  process.exit(1);
});