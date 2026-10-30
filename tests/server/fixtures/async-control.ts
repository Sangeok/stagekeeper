export type Hook = () => Promise<void>;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(promise: Promise<void>, options: { timeoutMs: number; message: string; signal?: AbortSignal }): Promise<void> {
  if (options.signal?.aborted) throw options.signal.reason;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(options.message)), options.timeoutMs);
      abort = () => reject(options.signal?.reason);
      options.signal?.addEventListener("abort", abort, { once: true });
    })]);
  } finally {
    clearTimeout(timer);
    if (abort) options.signal?.removeEventListener("abort", abort);
  }
}

export function ordered(timeoutMs = 8000): { winner: Hook; loser: Hook; finish: () => void; cancel: () => void } {
  const participants = deferred();
  const committed = deferred();
  const controller = new AbortController();
  let arrived = 0;
  const meet = async () => {
    if (++arrived === 2) participants.resolve();
    await waitFor(participants.promise, { timeoutMs, signal: controller.signal, message: "ordered participants did not arrive" });
  };
  return {
    winner: meet,
    loser: async () => {
      await meet();
      await waitFor(committed.promise, { timeoutMs, signal: controller.signal, message: "ordered winner did not finish" });
    },
    finish: committed.resolve,
    cancel: () => controller.abort(new Error("ordered barrier cancelled")),
  };
}

export function checkpoint(timeoutMs = 8000): { hook: Hook; entered: Hook; release: () => void } {
  const entered = deferred();
  const released = deferred();
  let first = true;
  return {
    hook: async () => {
      if (!first) return;
      first = false;
      entered.resolve();
      await waitFor(released.promise, { timeoutMs, message: "query checkpoint was not released" });
    },
    entered: () => waitFor(entered.promise, { timeoutMs, message: "query checkpoint did not arrive" }),
    release: released.resolve,
  };
}
