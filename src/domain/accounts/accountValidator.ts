import type { AccountCredential, LegacyAccountInput } from '../../core/types';

function requireNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Field "${fieldName}" wajib berupa string non-kosong.`);
  }

  return value.trim();
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function validateLegacyAccountInput(input: unknown): LegacyAccountInput[] {
  if (!Array.isArray(input)) {
    throw new Error('Format upload account harus array JSON.');
  }

  if (input.length === 0) {
    throw new Error('File account kosong.');
  }

  const names = new Set<string>();

  const accounts = input.map((item, index): LegacyAccountInput => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Item account pada index ${index} tidak valid.`);
    }

    const record = item as Record<string, unknown>;

    const name = normalizeName(requireNonEmptyString(record.name, `accounts[${index}].name`));
    const apiKey = requireNonEmptyString(record.apiKey, `accounts[${index}].apiKey`);
    const apiSecret = requireNonEmptyString(record.apiSecret, `accounts[${index}].apiSecret`);

    const lowered = name.toLowerCase();

    if (names.has(lowered)) {
      throw new Error(`Nama account duplikat terdeteksi: "${name}".`);
    }

    names.add(lowered);

    return { name, apiKey, apiSecret };
  });

  return accounts;
}

export function validateAccountCredential(account: AccountCredential): AccountCredential {
  if (!account.id?.trim()) {
    throw new Error(`Account "${account.name}" tidak memiliki id yang valid.`);
  }

  if (!account.name?.trim()) {
    throw new Error(`Ada account tanpa nama.`);
  }

  if (!account.apiKey?.trim()) {
    throw new Error(`Account "${account.name}" tidak memiliki apiKey.`);
  }

  if (!account.apiSecret?.trim()) {
    throw new Error(`Account "${account.name}" tidak memiliki apiSecret.`);
  }

  return {
    ...account,
    name: normalizeName(account.name),
    apiKey: account.apiKey.trim(),
    apiSecret: account.apiSecret.trim(),
  };
}

export function validateAccountList(accounts: AccountCredential[]): AccountCredential[] {
  if (!Array.isArray(accounts)) {
    throw new Error('Daftar account tidak valid.');
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const sanitized = accounts.map(validateAccountCredential).map((item) => {
    const idKey = item.id.toLowerCase();
    const nameKey = item.name.toLowerCase();

    if (seenIds.has(idKey)) {
      throw new Error(`Duplicate account id terdeteksi: "${item.id}".`);
    }

    if (seenNames.has(nameKey)) {
      throw new Error(`Duplicate account name terdeteksi: "${item.name}".`);
    }

    seenIds.add(idKey);
    seenNames.add(nameKey);

    return item;
  });

  return sanitized;
}
