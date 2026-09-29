/**
 * Starts voice-core on first use, the way Composer starts its sidecar
 * (ensureStarted in D:\Composer\src\main\sidecar.ts): nothing spawns until a
 * mic is pressed, and concurrent callers share one wait.
 *
 * Several apps share one service on one port. If the port already answers as
 * voice-core, the supervisor attaches with the token from its instance file instead
 * of spawning a second copy, and never kills a service it did not start.
 */

import { execFile, spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_PORT, HOST, TOKEN_HEADER, type Health, type VoiceCoreConnection } from "../shared/protocol";

export type VoiceCoreStatus = "stopped" | "starting" | "ready" | "crashed";

export interface ServiceCommand {
  file: string;
  args?: string[];
  cwd?: string;
}

export interface SupervisorOptions {
  command: ServiceCommand;
  port?: number;
  /** Extra service env, e.g. VOICE_CORE_MODEL, VOICE_CORE_DEVICE, VOICE_CORE_CUDA_DIR. */
  env?: Record<string, string>;
  /** Where the service writes instance-<port>.json; defaults to %LOCALAPPDATA%\voice-core. */
  stateDir?: string;
  readyTimeoutMs?: number;
  onLog?: (line: string) => void;
}

const READY_TIMEOUT_MS = 60_000;
const PING_INTERVAL_MS = 250;
const PING_TIMEOUT_MS = 1_000;
const ATTACH_WAIT_MS = 5_000;
const LOG_RING = 200;

export function defaultStateDir(): string {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), ".local", "share");
  return path.join(base, "voice-core");
}

/** The PyInstaller build an app ships under resources, e.g. `<resources>/voice-core`. */
export function packagedCommand(dir: string): ServiceCommand {
  const exe = path.join(dir, process.platform === "win32" ? "voice-core.exe" : "voice-core");
  return { file: exe, args: [], cwd: dir };
}

/** uv ships as uv.cmd on some installs, which spawn cannot exec without a shell,
 *  and `shell: true` concatenates argv instead of escaping it. */
function resolveUv(): string {
  if (process.platform !== "win32") return "uv";
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    for (const name of ["uv.exe", "uv.cmd", "uv.bat"]) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "uv.exe";
}

/** A checkout of D:\voice-core run through its uv project. */
export function devCommand(projectDir: string): ServiceCommand {
  return { file: resolveUv(), args: ["run", "--project", projectDir, "python", "-m", "voice_core"], cwd: projectDir };
}

export class VoiceCoreSupervisor {
  private readonly opts: SupervisorOptions;
  private readonly port: number;
  private readonly baseUrl: string;
  private child: ChildProcess | null = null;
  private owned = false;
  private token: string | null = null;
  private _status: VoiceCoreStatus = "stopped";
  private pending: Promise<VoiceCoreConnection | null> | null = null;
  private stopping = false;
  private readonly listeners = new Set<(s: VoiceCoreStatus) => void>();
  private readonly logRing: string[] = [];

  constructor(opts: SupervisorOptions) {
    this.opts = opts;
    this.port = opts.port ?? (Number(process.env.VOICE_CORE_PORT) || DEFAULT_PORT);
    this.baseUrl = `http://${HOST}:${this.port}`;
  }

  get status(): VoiceCoreStatus {
    return this._status;
  }

  /** True when this supervisor spawned the running service. */
  get ownsService(): boolean {
    return this.owned && this.child !== null;
  }

  connection(): VoiceCoreConnection | null {
    return this._status === "ready" && this.token ? { baseUrl: this.baseUrl, token: this.token } : null;
  }

  logs(): string[] {
    return [...this.logRing];
  }

  onStatus(cb: (s: VoiceCoreStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private setStatus(next: VoiceCoreStatus): void {
    if (this._status === next) return;
    this._status = next;
    for (const cb of this.listeners) {
      try {
        cb(next);
      } catch {
        // a listener's failure is its own
      }
    }
  }

  private record(line: string): void {
    this.logRing.push(line);
    if (this.logRing.length > LOG_RING) this.logRing.splice(0, this.logRing.length - LOG_RING);
    this.opts.onLog?.(line);
  }

  /** Resolves with a connection once the service answers, or null if it cannot come up. */
  ensureStarted(): Promise<VoiceCoreConnection | null> {
    const ready = this.connection();
    if (ready && this.child) return Promise.resolve(ready);
    if (!this.pending) {
      this.pending = this.bringUp().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  private async bringUp(): Promise<VoiceCoreConnection | null> {
    // An attached service belongs to another app and may have exited since.
    if (this._status === "ready" && !this.owned && this.token && (await this.health(this.token))?.authorized) {
      return this.connection();
    }
    this.stopping = false;
    this.setStatus("starting");
    const existing = await this.health();
    if (!existing) {
      const spawned = await this.spawnService();
      if (spawned || this.stopping) return spawned;
    }
    // Either the port was already taken, or another app won the race to bind it
    // (the loser exits before loading anything); its service is the one to use.
    const running = existing ?? (await this.health());
    const conn = running?.service === "voice-core" ? await this.attach() : null;
    if (conn) return conn;
    if (running) this.record(`port ${this.port} answers but not as a voice-core this app can use`);
    this.setStatus("crashed");
    return null;
  }

  /** The winner of a start race writes its instance file just after binding, so
   *  it may not exist yet on the first read. */
  private async attach(): Promise<VoiceCoreConnection | null> {
    const deadline = Date.now() + ATTACH_WAIT_MS;
    for (;;) {
      const token = this.readInstanceToken();
      if (token && (await this.health(token))?.authorized) {
        this.token = token;
        this.owned = false;
        this.setStatus("ready");
        return this.connection();
      }
      if (Date.now() > deadline) return null;
      await new Promise((r) => setTimeout(r, PING_INTERVAL_MS));
    }
  }

  private readInstanceToken(): string | null {
    const file = path.join(this.opts.stateDir ?? defaultStateDir(), `instance-${this.port}.json`);
    try {
      const body = JSON.parse(fs.readFileSync(file, "utf8")) as { port?: number; token?: string };
      return body.port === this.port && typeof body.token === "string" ? body.token : null;
    } catch {
      return null;
    }
  }

  private async health(token?: string): Promise<Health | null> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: token ? { [TOKEN_HEADER]: token } : {},
        signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      });
      return res.ok ? ((await res.json()) as Health) : null;
    } catch {
      return null;
    }
  }

  private spawnService(): Promise<VoiceCoreConnection | null> {
    const token = crypto.randomBytes(24).toString("base64url");
    const { file, args = [], cwd } = this.opts.command;
    let proc: ChildProcess;
    try {
      proc = spawn(file, args, {
        cwd,
        env: {
          ...process.env,
          ...this.opts.env,
          VOICE_CORE_PORT: String(this.port),
          VOICE_CORE_TOKEN: token,
          ...(this.opts.stateDir ? { VOICE_CORE_STATE_DIR: this.opts.stateDir } : {}),
        },
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
        shell: /\.(cmd|bat)$/i.test(file),
      });
    } catch (err) {
      this.record(`spawn failed: ${err instanceof Error ? err.message : String(err)}`);
      this.setStatus("crashed");
      return Promise.resolve(null);
    }
    this.child = proc;
    this.owned = true;
    this.token = token;
    this.pipe(proc.stdout);
    this.pipe(proc.stderr);

    return new Promise((resolve) => {
      let done = false;
      const finish = (conn: VoiceCoreConnection | null) => {
        if (done) return;
        done = true;
        resolve(conn);
      };
      const gone = (why: string) => {
        if (this.child !== proc) return;
        this.child = null;
        if (this.stopping) {
          this.setStatus("stopped");
        } else {
          this.record(why);
          // During start, bringUp decides between attaching and reporting a crash.
          if (done) this.setStatus("crashed");
        }
        finish(null);
      };
      proc.on("error", (err) => {
        this.record(`process error: ${err.message}`);
        // A spawn that never started (ENOENT) emits no exit event.
        if (proc.pid === undefined) gone("the service could not be started");
      });
      proc.on("exit", (code, signal) => gone(`exited (code ${code ?? "null"}, signal ${signal ?? "null"})`));

      const deadline = Date.now() + (this.opts.readyTimeoutMs ?? READY_TIMEOUT_MS);
      const poll = async () => {
        if (done || this.child !== proc) return;
        const h = await this.health(token);
        if (done || this.child !== proc) return;
        if (h?.authorized) {
          this.setStatus("ready");
          finish(this.connection());
          return;
        }
        if (Date.now() > deadline) {
          this.record(`no answer on ${this.baseUrl}/health within the ready timeout`);
          this.kill(proc);
          this.child = null;
          this.setStatus("crashed");
          finish(null);
          return;
        }
        setTimeout(() => void poll(), PING_INTERVAL_MS).unref?.();
      };
      void poll();
    });
  }

  private pipe(stream: NodeJS.ReadableStream | null): void {
    if (!stream) return;
    let buffer = "";
    stream.setEncoding?.("utf8");
    stream.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) this.record(line);
    });
  }

  /** On Windows the service runs under a uv or bootloader parent, so killing the
   *  pid alone leaves the port bound. */
  private kill(proc: ChildProcess): void {
    if (proc.pid === undefined) return;
    if (process.platform === "win32") {
      execFile("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { windowsHide: true }, (err) => {
        if (err) proc.kill();
      });
      return;
    }
    proc.kill();
  }

  /** Kills the service only if this supervisor started it; an attached one is left running. */
  stop(): Promise<void> {
    this.stopping = true;
    const proc = this.child;
    if (this.owned) this.token = null;
    if (!proc || proc.pid === undefined || proc.exitCode !== null) {
      this.child = null;
      this.setStatus("stopped");
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      proc.once("exit", () => resolve());
      proc.once("error", () => resolve());
      this.kill(proc);
    });
  }
}
