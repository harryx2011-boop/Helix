import type { CDPSession, Page } from 'playwright';
import type { Log } from '../core/logger.js';


export interface ScreencastFrame {
  data: string;
  width: number;
  height: number;
  at: number;
}

export interface ScreencastOptions {
  maxWidth?: number | undefined;
  maxHeight?: number | undefined;
  quality?: number | undefined;
  logger?: Log | undefined;
}

type Listener = (frame: ScreencastFrame) => void;

export interface CastSession {
  send(method: 'Page.startScreencast', params: Record<string, unknown>): Promise<unknown>;
  send(method: 'Page.stopScreencast'): Promise<unknown>;
  send(method: 'Page.screencastFrameAck', params: { sessionId: number }): Promise<unknown>;
  on(
    event: 'Page.screencastFrame',
    listener: (event: { data: string; sessionId: number; metadata: { deviceWidth: number; deviceHeight: number } }) => void,
  ): unknown;
  detach(): Promise<void>;
}

export type CastSessionFactory = () => Promise<CastSession>;

export function cdpSessionFor(page: Page): CastSessionFactory {
  return async () => (await page.context().newCDPSession(page)) as CDPSession as unknown as CastSession;
}

export class Screencast {
  readonly #openSession: CastSessionFactory;
  readonly #options: ScreencastOptions;
  readonly #listeners = new Set<Listener>();
  #cdp: CastSession | undefined;
  #starting: Promise<void> | undefined;
  #lastFrame: ScreencastFrame | undefined;

  constructor(openSession: CastSessionFactory, options: ScreencastOptions = {}) {
    this.#openSession = openSession;
    this.#options = options;
  }

  get lastFrame(): ScreencastFrame | undefined {
    return this.#lastFrame;
  }

  get viewers(): number {
    return this.#listeners.size;
  }

  get running(): boolean {
    return this.#cdp !== undefined;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    if (this.#lastFrame) listener(this.#lastFrame);
    void this.#ensureStarted().catch((error) => {
      this.#options.logger?.warn({ error }, 'screencast failed to start');
    });

    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) void this.stop();
    };
  }

  async #ensureStarted(): Promise<void> {
    if (this.#cdp) return;
    if (this.#starting) return this.#starting;

    this.#starting = (async () => {
      const cdp = await this.#openSession();
      cdp.on('Page.screencastFrame', (event) => {
        this.#lastFrame = {
          data: event.data,
          width: event.metadata.deviceWidth,
          height: event.metadata.deviceHeight,
          at: Date.now(),
        };
        for (const listener of this.#listeners) {
          try {
            listener(this.#lastFrame);
          } catch (error) {
            this.#options.logger?.debug({ error }, 'screencast listener threw');
          }
        }
        cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => undefined);
      });
      await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: this.#options.quality ?? 60,
        maxWidth: this.#options.maxWidth ?? 1280,
        maxHeight: this.#options.maxHeight ?? 800,
        everyNthFrame: 1,
      });
      this.#cdp = cdp;
    })().finally(() => {
      this.#starting = undefined;
    });

    return this.#starting;
  }

  async stop(): Promise<void> {
    if (this.#starting) await this.#starting.catch(() => undefined);
    const cdp = this.#cdp;
    this.#cdp = undefined;
    if (!cdp) return;
    await cdp.send('Page.stopScreencast').catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
}
