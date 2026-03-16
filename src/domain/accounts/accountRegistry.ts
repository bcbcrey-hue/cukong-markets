import type { AccountCredential, LegacyAccountInput } from '../../core/types';
import { AccountStore } from './accountStore';

export class AccountRegistry {
  private accounts: AccountCredential[] = [];

  constructor(private readonly store: AccountStore) {}

  async reload(): Promise<AccountCredential[]> {
    this.accounts = await this.store.loadAll();
    return this.accounts;
  }

  async initialize(): Promise<AccountCredential[]> {
    return this.reload();
  }

  listAll(): AccountCredential[] {
    return [...this.accounts];
  }

  listEnabled(): AccountCredential[] {
    return this.accounts.filter((item) => item.enabled);
  }

  countEnabled(): number {
    return this.listEnabled().length;
  }

  hasAccounts(): boolean {
    return this.accounts.length > 0;
  }

  getDefault(): AccountCredential | undefined {
    return (
      this.accounts.find((item) => item.isDefault && item.enabled) ??
      this.accounts.find((item) => item.isDefault) ??
      this.accounts.find((item) => item.enabled) ??
      this.accounts[0]
    );
  }

  getById(accountId: string): AccountCredential | undefined {
    return this.accounts.find((item) => item.id === accountId);
  }

  getByName(name: string): AccountCredential | undefined {
    const key = name.trim().toLowerCase();
    return this.accounts.find((item) => item.name.trim().toLowerCase() === key);
  }

  async saveLegacyUpload(input: unknown): Promise<AccountCredential[]> {
    const saved = await this.store.saveLegacyUpload(input);
    this.accounts = saved;
    return this.accounts;
  }

  async upsertLegacyAccounts(items: LegacyAccountInput[]): Promise<AccountCredential[]> {
    const saved = await this.store.upsertLegacyAccounts(items);
    this.accounts = saved;
    return this.accounts;
  }

  async setEnabled(accountId: string, enabled: boolean): Promise<AccountCredential[]> {
    const saved = await this.store.setEnabled(accountId, enabled);
    this.accounts = saved;
    return this.accounts;
  }

  async setDefault(accountId: string): Promise<AccountCredential[]> {
    const saved = await this.store.setDefault(accountId);
    this.accounts = saved;
    return this.accounts;
  }

  async delete(accountId: string): Promise<AccountCredential[]> {
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
