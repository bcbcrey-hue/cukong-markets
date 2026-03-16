import path from 'node:path';
import { env } from '../../config/env';
import type { LegacyUploadedAccount, StoredAccount } from '../../core/types';
import { JsonStore } from '../../storage/jsonStore';
import { validateLegacyAccounts, validateStoredAccounts } from './accountValidator';

type AccountsMetaSource = 'manual' | 'migration' | 'telegram_upload';

export interface AccountsMeta {
  lastUpdatedAt: string | null;
  defaultAccountId: string | null;
  source: AccountsMetaSource;
  totalAccounts: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'account';
}

function createAccountId(name: string): string {
  return `${slugifyName(name)}-${Date.now()}`;
}

export class AccountStore {
  private readonly accountsStore = new JsonStore<StoredAccount[]>(env.accountsFile, []);
  private readonly metaStore = new JsonStore<AccountsMeta>(
    path.resolve(env.dataDir, 'accounts-meta.json'),
    {
      lastUpdatedAt: null,
      defaultAccountId: null,
      source: 'manual',
      totalAccounts: 0,
    },
  );

  getFilePath(): string {
    return this.accountsStore.getPath();
  }

  async loadAll(): Promise<StoredAccount[]> {
    const raw = await this.accountsStore.read();
    return validateStoredAccounts(raw);
  }

  async loadMeta(): Promise<AccountsMeta> {
    return this.metaStore.read();
  }

  async saveAll(
    accounts: StoredAccount[],
    source: AccountsMetaSource = 'manual',
  ): Promise<StoredAccount[]> {
    const normalized = validateStoredAccounts(accounts);
    await this.accountsStore.write(normalized);

    const defaultAccount = normalized.find((item) => item.isDefault) ?? null;

    await this.metaStore.write({
      lastUpdatedAt: nowIso(),
      defaultAccountId: defaultAccount?.id ?? null,
      source,
      totalAccounts: normalized.length,
    });

    return normalized;
  }

  async saveLegacyUpload(input: unknown): Promise<StoredAccount[]> {
    const parsed = validateLegacyAccounts(input);
    return this.replaceFromLegacy(parsed, 'telegram_upload');
  }

  async replaceFromLegacy(
    items: LegacyUploadedAccount[],
    source: AccountsMetaSource = 'manual',
  ): Promise<StoredAccount[]> {
    const parsed = validateLegacyAccounts(items);
    const now = nowIso();

    const accounts: StoredAccount[] = parsed.map((item, index) => ({
      id: createAccountId(item.name),
      name: item.name.trim(),
      apiKey: item.apiKey.trim(),
      apiSecret: item.apiSecret.trim(),
      enabled: true,
      isDefault: index === 0,
      createdAt: now,
      updatedAt: now,
    }));

    return this.saveAll(accounts, source);
  }

  async upsertLegacyAccounts(items: LegacyUploadedAccount[]): Promise<StoredAccount[]> {
    const incoming = validateLegacyAccounts(items);
    const current = await this.loadAll();
    const now = nowIso();

    const currentByName = new Map(
      current.map((item) => [item.name.trim().toLowerCase(), item] as const),
    );

    const next: StoredAccount[] = incoming.map((item, index) => {
      const existing = currentByName.get(item.name.trim().toLowerCase());

      return {
        id: existing?.id ?? createAccountId(item.name),
        name: item.name.trim(),
        apiKey: item.apiKey.trim(),
        apiSecret: item.apiSecret.trim(),
        enabled: existing?.enabled ?? true,
        isDefault: existing?.isDefault ?? index === 0,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
    });

    return this.saveAll(next, 'migration');
  }

  async delete(accountId: string): Promise<StoredAccount[]> {
    const current = await this.loadAll();
    const next = current.filter((item) => item.id !== accountId);
    return this.saveAll(next, 'manual');
  }

  async setEnabled(accountId: string, enabled: boolean): Promise<StoredAccount[]> {
    const current = await this.loadAll();

    const next = current.map((item) =>
      item.id === accountId
        ? {
            ...item,
            enabled,
            updatedAt: nowIso(),
          }
        : item,
    );

    return this.saveAll(next, 'manual');
  }

  async setDefault(accountId: string): Promise<StoredAccount[]> {
    const current = await this.loadAll();

    if (!current.some((item) => item.id === accountId)) {
      throw new Error(`Account dengan id "${accountId}" tidak ditemukan.`);
    }

    const next = current.map((item) => ({
      ...item,
      isDefault: item.id === accountId,
      updatedAt: nowIso(),
    }));

    return this.saveAll(next, 'manual');
  }
}
