import type {
  LegacyUploadedAccount,
  RuntimeAccountsFile,
  StoredAccount,
} from '../../core/types';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Field "${field}" wajib berupa string non-kosong.`);
  }

  return value.trim();
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function validateLegacyAccounts(input: unknown): LegacyUploadedAccount[] {
  if (!Array.isArray(input)) {
    throw new Error('Format upload account harus berupa array JSON.');
  }

  if (input.length === 0) {
    throw new Error('Daftar account kosong.');
  }

  const seenNames = new Set<string>();

  return input.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Account pada index ${index} tidak valid.`);
    }

    const row = item as Record<string, unknown>;
    const name = normalizeName(requireString(row.name, `accounts[${index}].name`));
    const apiKey = requireString(row.apiKey, `accounts[${index}].apiKey`);
    const apiSecret = requireString(row.apiSecret, `accounts[${index}].apiSecret`);

    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      throw new Error(`Nama account duplikat: "${name}".`);
    }
    seenNames.add(key);

    return { name, apiKey, apiSecret };
  });
}

export function validateManualAccountInput(input: unknown): LegacyUploadedAccount {
  if (!input || typeof input !== 'object') {
    throw new Error('Input account manual tidak valid.');
  }

  const row = input as Record<string, unknown>;
  const name = normalizeName(requireString(row.name, 'account.name'));
  const apiKey = requireString(row.apiKey, 'account.apiKey');
  const apiSecret = requireString(row.apiSecret, 'account.apiSecret');

  return { name, apiKey, apiSecret };
}

export function validateStoredAccounts(accounts: StoredAccount[]): StoredAccount[] {
  if (!Array.isArray(accounts)) {
    throw new Error('Stored accounts tidak valid.');
  }

  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  const normalized = accounts.map((item, index) => {
    const id = requireString(item.id, `stored[${index}].id`);
    const name = normalizeName(requireString(item.name, `stored[${index}].name`));
    const apiKey = requireString(item.apiKey, `stored[${index}].apiKey`);
    const apiSecret = requireString(item.apiSecret, `stored[${index}].apiSecret`);

    const idKey = id.toLowerCase();
    const nameKey = name.toLowerCase();

    if (seenIds.has(idKey)) {
      throw new Error(`Duplicate account id: "${id}".`);
    }
    if (seenNames.has(nameKey)) {
      throw new Error(`Duplicate account name: "${name}".`);
    }

    seenIds.add(idKey);
    seenNames.add(nameKey);

    return {
      ...item,
      id,
      name,
      apiKey,
      apiSecret,
      enabled: item.enabled ?? true,
      isDefault: item.isDefault ?? false,
      createdAt: item.createdAt ?? new Date().toISOString(),
      updatedAt: item.updatedAt ?? new Date().toISOString(),
    };
  });

  if (normalized.length > 0 && !normalized.some((item) => item.isDefault)) {
    normalized[0] = {
      ...normalized[0],
      isDefault: true,
    };
  }

  let foundDefault = false;
  return normalized.map((item) => {
    if (item.isDefault && !foundDefault) {
      foundDefault = true;
      return item;
    }

    if (item.isDefault && foundDefault) {
      return { ...item, isDefault: false };
    }

    return item;
  });
}

export function validateRuntimeAccountsFile(input: unknown): RuntimeAccountsFile {
  if (!input || typeof input !== 'object') {
    throw new Error('Format runtime accounts tidak valid.');
  }

  const row = input as Record<string, unknown>;
  if (row.format !== 'runtime_accounts_v1') {
    throw new Error('Format runtime accounts harus "runtime_accounts_v1".');
  }
  if (row.secretStorage !== 'plaintext_local') {
    throw new Error('secretStorage runtime accounts harus "plaintext_local".');
  }

  return {
    format: 'runtime_accounts_v1',
    secretStorage: 'plaintext_local',
    accounts: validateStoredAccounts(row.accounts as StoredAccount[]),
  };
}

export class AccountValidator {
  validateLegacyArray(input: unknown): LegacyUploadedAccount[] {
    return validateLegacyAccounts(input);
  }

  validateStoredList(accounts: StoredAccount[]): StoredAccount[] {
    return validateStoredAccounts(accounts);
  }
}
