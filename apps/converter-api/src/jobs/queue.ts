import { cpus } from 'node:os';

type Task = () => Promise<void>;

/**
 * ffmpeg saturates every core it is given, so running more jobs than cores
 * makes all of them slower rather than any of them faster.
 */
export class Queue {
  private readonly pending: { task: Task; onCancel: () => void }[] = [];
  private active = 0;

  constructor(readonly concurrency = Math.max(1, cpus().length - 1)) {}

  add(task: Task, onCancel: () => void = () => {}): void {
    this.pending.push({ task, onCancel });
    this.drain();
  }

  /** Removes a job that has not started yet. Running jobs cancel their process. */
  dequeue(predicate: (entry: { task: Task }) => boolean): boolean {
    const index = this.pending.findIndex(predicate);
    if (index === -1) return false;
    const [entry] = this.pending.splice(index, 1);
    entry?.onCancel();
    return true;
  }

  get depth(): number {
    return this.pending.length;
  }

  private drain(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const entry = this.pending.shift();
      if (!entry) return;
      this.active++;
      void entry
        .task()
        .catch(() => {})
        .finally(() => {
          this.active--;
          this.drain();
        });
    }
  }
}
