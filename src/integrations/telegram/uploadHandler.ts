import type { Context } from 'telegraf';
import { AccountRegistry } from '../../domain/accounts/accountRegistry';
import { AccountStore } from '../../domain/accounts/accountStore';

export class UploadHandler {
  constructor(
    private readonly store: AccountStore,
    private readonly registry: AccountRegistry,
  ) {}

  async handleDocument(ctx: Context): Promise<string> {
    const message = ctx.message as { document?: { file\_name?: string; file\_id: string } } | undefined;
    const doc = message?.document;
    if (!doc?.file\_name?.toLowerCase().endsWith('.json')) {
      throw new Error('Hanya file .json yang diizinkan');
    }

    const url = await ctx.telegram.getFileLink(doc.file\_id);
    const response = await fetch(url.toString());
    const text = await response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('File JSON tidak valid');
    }

    const accounts = await this.store.saveLegacyUpload(parsed);
    await this.registry.reload();
    return `Upload berhasil. ${accounts.length} account tersimpan di data/accounts/accounts.json`;
  }
}
