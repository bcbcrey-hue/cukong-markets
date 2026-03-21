import crypto from 'node:crypto';
import type { JournalEntry, ShadowRunEvidence } from '../core/types';
import { PersistenceService } from './persistenceService';

export class JournalService {
  private entries: JournalEntry[] = [];

  constructor(private readonly persistence: PersistenceService) {}

  async load(): Promise<JournalEntry[]> {
    this.entries = await this.persistence.readJournal();
    return this.entries;
  }

  list(): JournalEntry[] {
    return this.entries;
  }

  recent(limit = 100): JournalEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  async append(entry: JournalEntry): Promise<JournalEntry> {
    this.entries.push(entry);
    await this.persistence.appendJournal(entry);
    return entry;
  }

  async info(title: string, message: string, payload?: Record<string, unknown>): Promise<void> {
    await this.append({
      id: crypto.randomUUID(),
      type: 'INFO',
      title,
      message,
      payload,
      createdAt: new Date().toISOString(),
    });
  }

  async warn(title: string, message: string, payload?: Record<string, unknown>): Promise<void> {
    await this.append({
      id: crypto.randomUUID(),
      type: 'WARN',
      title,
      message,
      payload,
      createdAt: new Date().toISOString(),
    });
  }

  async error(title: string, message: string, payload?: Record<string, unknown>): Promise<void> {
    await this.append({
      id: crypto.randomUUID(),
      type: 'ERROR',
      title,
      message,
      payload,
      createdAt: new Date().toISOString(),
    });
  }

  async recordShadowRunEvidence(evidence: ShadowRunEvidence): Promise<void> {
    await this.persistence.appendShadowRunEvidence(evidence);
  }

  async listShadowRunEvidence(): Promise<ShadowRunEvidence[]> {
    return this.persistence.readShadowRunEvidence();
  }
}
