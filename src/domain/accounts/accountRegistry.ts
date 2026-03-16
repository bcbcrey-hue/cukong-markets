import type { AccountCredential } from '../../core/types';
import { AccountStore } from './accountStore';

export class AccountRegistry {
  private accounts: AccountCredential\[] = \[];

  constructor(private readonly store: AccountStore) {}

  async reload(): Promise<AccountCredential\[]> {
    const loaded = await this.store.loadAll();
    this.accounts = loaded.filter((item) => item.name \&\& item.apiKey \&\& item.apiSecret);
    return this.accounts;
  }

  listAll(): AccountCredential\[] {
    return this.accounts;
  }

  listEnabled(): AccountCredential\[] {
    return this.accounts.filter((item) => item.enabled);
  }

  getDefault(): AccountCredential | undefined {
    return this.accounts.find((item) => item.isDefault) ?? this.accounts.find((item) => item.enabled);
  }

  getById(accountId: string): AccountCredential | undefined {
    return this.accounts.find((item) => item.id === accountId);
  }
}
