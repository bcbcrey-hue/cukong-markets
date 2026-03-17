import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { withRetry } from '../../utils/retry';

export interface HttpClientOptions {
  baseURL?: string;
  timeoutMs: number;
  headers?: Record<string, string>;
}

export class HttpClient {
  private readonly client: AxiosInstance;

  constructor(options: HttpClientOptions) {
    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeoutMs,
      headers: options.headers,
    });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return withRetry(
      async () => {
        const response = await this.client.get<T>(url, config);
        return response.data;
      },
      { retries: 2, baseDelayMs: 250 },
    );
  }

  async postForm<T>(
    url: string,
    body: URLSearchParams | Record<string, string | number>,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    const payload =
      body instanceof URLSearchParams
        ? body
        : new URLSearchParams(
            Object.entries(body).map(([key, value]) => [key, String(value)]),
          );

    return withRetry(
      async () => {
        const response = await this.client.post<T>(url, payload, {
          ...config,
          headers: {
            'content-type': 'application/x-www-form-urlencoded',
            ...(config?.headers ?? {}),
          },
        });
        return response.data;
      },
      { retries: 2, baseDelayMs: 250 },
    );
  }
}
