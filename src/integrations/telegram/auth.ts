import type { Context } from 'telegraf';
import { env } from '../../config/env';

export function isTelegramUserAllowed(userId?: number): boolean {
  if (!userId) {
    return false;
  }

  if (env.telegramAllowedUserIds.length === 0) {
    return false;
  }

  return env.telegramAllowedUserIds.includes(userId);
}

export async function denyTelegramAccess(ctx: Context): Promise<boolean> {
  const userId = ctx.from?.id;
  if (isTelegramUserAllowed(userId)) {
    return false;
  }

  await ctx.reply('Access denied.');
  return true;
}
