/**
 * A counting semaphore with a bounded queue: at most `max` tasks run at once, at most `queue` wait
 * for a turn, each for at most `waitMs`. Anything past that is refused at once, so a client cannot
 * pile work up in the root daemon (security review of phase 05, L3).
 */
export class Busy extends Error {}

export class Limiter {
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly max: number,
    private readonly queue: number,
    private readonly waitMs: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return Promise.resolve();
    }
    if (this.waiting.length >= this.queue)
      return Promise.reject(new Busy(`${this.waiting.length} already waiting`));
    return new Promise<void>((resolve, reject) => {
      const turn = () => {
        clearTimeout(timer);
        // The slot is handed over by release(): `running` already counts this task.
        resolve();
      };
      const timer = setTimeout(() => {
        const i = this.waiting.indexOf(turn);
        if (i >= 0) this.waiting.splice(i, 1);
        reject(new Busy(`no turn in ${this.waitMs} ms`));
      }, this.waitMs);
      this.waiting.push(turn);
    });
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.running--;
  }
}
