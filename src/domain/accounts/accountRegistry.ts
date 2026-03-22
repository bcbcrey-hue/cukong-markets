import type { LegacyUploadedAccount, StoredAccount } from '../../core/types';
import { AccountStore } from './accountStore';

export class AccountRegistry {
  private accounts: StoredAccount[] = [];

  constructor(private readonly store: AccountStore) {}

  async initialize(): Promise<StoredAccount[]> {
    return this.reload();
  }

  async reload(): Promise<StoredAccount[]> {
    this.accounts = await this.store.loadAll();
    return this.accounts;
  }

  listAll(): StoredAccount[] {
    return [...this.accounts];
  }

  listEnabled(): StoredAccount[] {
    return this.accounts.filter((item) => item.enabled);
  }

  countEnabled(): number {
    return this.listEnabled().length;
  }

  hasAccounts(): boolean {
    return this.accounts.length > 0;
  }

  getDefault(): StoredAccount | undefined {
    return (
      this.accounts.find((item) => item.isDefault && item.enabled) ??
      this.accounts.find((item) => item.isDefault) ??
      this.accounts.find((item) => item.enabled) ??
      this.accounts[0]
    );
  }

  getById(accountId: string): StoredAccount | undefined {
    return this.accounts.find((item) => item.id === accountId);
  }

  getByName(name: string): StoredAccount | undefined {
    const key = name.trim().toLowerCase();
    return this.accounts.find((item) => item.name.trim().toLowerCase() === key);
  }

  async saveLegacyUpload(input: unknown): Promise<StoredAccount[]> {
    const saved = await this.store.saveLegacyUpload(input);
    this.accounts = saved;
    return this.accounts;
  }

  async upsertLegacyAccounts(items: LegacyUploadedAccount[]): Promise<StoredAccount[]> {
    const saved = await this.store.upsertLegacyAccounts(items);
    this.accounts = saved;
    return this.accounts;
  }

  async addManualAccount(input: LegacyUploadedAccount): Promise<StoredAccount[]> {
    const saved = await this.store.addManual(input);
    this.accounts = saved;
    return this.accounts;
  }

  async setEnabled(accountId: string, enabled: boolean): Promise<StoredAccount[]> {
    const saved = await this.store.setEnabled(accountId, enabled);
    this.accounts = saved;
    return this.accounts;
  }

  async setDefault(accountId: string): Promise<StoredAccount[]> {
    const saved = await this.store.setDefault(accountId);
    this.accounts = saved;
    return this.accounts;
  }

  async delete(accountId: string): Promise<StoredAccount[]> {
    const saved = await this.store.delete(accountId);
    this.accounts = saved;
    return this.accounts;
  }

  async loadMeta() {
    return this.store.loadMeta();
  }

  getStoragePath(): string {
    return this.store.getFilePath();
  }
}
