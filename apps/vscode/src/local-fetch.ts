import { request } from 'node:http';

export interface LocalInit {
  method?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface LocalResponse {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export function localFetch(url: string, init: LocalInit = {}): Promise<LocalResponse> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: init.method ?? 'GET', headers: init.headers, signal: init.signal }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => {
        const status = res.statusCode ?? 0;
        resolve({
          status,
          ok: status >= 200 && status < 300,
          headers: {
            get: (name) => {
              const value = res.headers[name.toLowerCase()];
              return Array.isArray(value) ? value.join(', ') : (value ?? null);
            },
          },
          json: async () => JSON.parse(Buffer.concat(chunks).toString('utf8')),
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}
