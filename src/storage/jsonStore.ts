import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

export interface JsonStoreOptions<T> {
  filePath: string;
  fallback: T;
  pretty?: boolean;
}

export class JsonStore<T> {
  private readonly filePath: string;
  private readonly fallback: T;
  private readonly pretty: boolean;

  constructor(options: JsonStoreOptions<T>) {
    this.filePath = options.filePath;
    this.fallback = options.fallback;
    this.pretty = options.pretty ?? true;
  }

  getPath(): string {
    return this.filePath;
  }

  async ensureDir(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
  }

  async exists(): Promise<boolean> {
    try {
      await readFile(this.filePath, 'utf8');
      return true;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  async read(): Promise<T> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return JSON.parse(raw) as T;
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        await this.write(this.cloneFallback());
        return this.cloneFallback();
      }
      throw error;
    }
  }

  async write(data: T): Promise<void> {
    await this.ensureDir();
    const content = this.pretty
      ? JSON.stringify(data, null, 2)
      : JSON.stringify(data);
    await writeFile(this.filePath, content, 'utf8');
  }

  async update(updater: (current: T) => T | Promise<T>): Promise<T> {
    const current = await this.read();
    const next = await updater(current);
    await this.write(next);
    return next;
  }

  async reset(): Promise<T> {
    const fallback = this.cloneFallback();
    await this.write(fallback);
    return fallback;
  }

  private cloneFallback(): T {
    return JSON.parse(JSON.stringify(this.fallback)) as T;
  }
}

export class JsonLinesStore<T extends object> {
  constructor(private readonly filePath: string) {}

  getPath(): string {
    return this.filePath;
  }

  async ensureDir(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
  }

  async append(entry: T): Promise<void> {
    await this.ensureDir();
    await appendFile(this.filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  async appendMany(entries: T[]): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    await this.ensureDir();
    const payload = entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
    await appendFile(this.filePath, payload, 'utf8');
  }

  async readAll(): Promise<T[]> {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      return raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as T);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
