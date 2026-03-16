export type TelegramNamespace =
  | 'NAV'
  | 'ACC'
  | 'SET'
  | 'SIG'
  | 'BUY'
  | 'POS'
  | 'EMG'
  | 'BKT';

export interface TelegramCallbackPayload {
  namespace: TelegramNamespace;
  action: string;
  value?: string;
  pair?: string;
}

export function buildCallback(payload: TelegramCallbackPayload): string {
  const parts = [
    payload.namespace,
    payload.action,
    payload.value ?? '',
    payload.pair ?? '',
  ];

  return parts.join('|').slice(0, 64);
}

export function parseCallback(raw: string): TelegramCallbackPayload | null {
  if (!raw || raw.length > 64) {
    return null;
  }

  const [namespace, action, value, pair] = raw.split('|');

  if (!namespace || !action) {
    return null;
  }

  const allowedNamespaces: TelegramNamespace[] = [
    'NAV',
    'ACC',
    'SET',
    'SIG',
    'BUY',
    'POS',
    'EMG',
    'BKT',
  ];

  if (!allowedNamespaces.includes(namespace as TelegramNamespace)) {
    return null;
  }

  return {
    namespace: namespace as TelegramNamespace,
    action,
    value: value || undefined,
    pair: pair || undefined,
  };
}
