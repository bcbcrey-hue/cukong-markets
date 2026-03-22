import type { Context } from 'telegraf';
import { AccountRegistry } from '../../domain/accounts/accountRegistry';
import { AccountStore } from '../../domain/accounts/accountStore';

export class UploadHandler {
  constructor(
    private readonly store: AccountStore,
    private readonly registry: AccountRegistry,
  ) {}

  async handleDocument(ctx: Context): Promise<string> {
    const message = ctx.message as
      | {
          document?: {
            file_name?: string;
            file_id: string;
          };
        }
      | undefined;

    const document = message?.document;

    if (!document?.file_name?.toLowerCase().endsWith('.json')) {
      throw new Error('Hanya file .json yang diizinkan.');
    }

    const fileLink = await ctx.telegram.getFileLink(document.file_id);
    const response = await fetch(fileLink.toString());

    if (!response.ok) {
      throw new Error(`Gagal mengunduh file Telegram: HTTP ${response.status}`);
    }

    const text = await response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('File JSON tidak valid.');
    }

    const accounts = await this.store.saveLegacyUpload(parsed);
    await this.registry.reload();

    return [
      'Upload legacy berhasil.',
      `${accounts.length} account tersimpan.`,
      'Runtime file: data/accounts/accounts.json (format runtime_accounts_v1, secretStorage=plaintext_local).',
    ].join('\n');
  }
}
