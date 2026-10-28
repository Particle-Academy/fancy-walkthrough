/**
 * Tell a walkthrough what happened in the app from OUTSIDE its React tree.
 *
 * `useWalkthrough().signal` covers anything rendered inside `<Walkthrough>`.
 * This covers the rest: a mutation default in a query client, a module-level
 * websocket handler, a Blade island in another React root. Create one in a
 * module, pass it to `<Walkthrough controller>`, and call it from anywhere.
 *
 * A message sent while no walkthrough is attached (a per-page `<Walkthrough>`
 * between one page unmounting and the next mounting -- exactly when an
 * Inertia visit's `onSuccess` fires) is HELD and handed to the next one that
 * attaches. That walkthrough applies it once, to the step it resumes on, and
 * only if that step awaits it; otherwise it is dropped. So a held message can
 * never restart a dismissed tour or skip ahead.
 *
 * Touches nothing global: safe to create at module scope, on the server too.
 */
export interface WalkthroughController {
  /** The action `event` happened. Advances a current `advanceOn: "event"` step awaiting it. */
  signal(event: string): void;
  /** The action `event` was attempted and failed. The step stays put and shows `message`. */
  fail(event: string, message?: string): void;
  /**
   * Used by `<Walkthrough controller>`. Attaches a receiver and returns what
   * was held for it, plus the detach function.
   */
  connect(receiver: (message: WalkthroughActionMessage) => void): { held: WalkthroughActionMessage[]; disconnect: () => void };
}

/** One message from the app to a walkthrough. */
export type WalkthroughActionMessage = { kind: "signal"; event: string } | { kind: "fail"; event: string; message?: string };

/** Enough for any real hand-over; bounds what a never-attached controller keeps. */
const MAX_HELD = 8;

export function createWalkthroughController(): WalkthroughController {
  const receivers = new Set<(message: WalkthroughActionMessage) => void>();
  let held: WalkthroughActionMessage[] = [];

  const send = (message: WalkthroughActionMessage): void => {
    if (receivers.size === 0) {
      held = [...held, message].slice(-MAX_HELD);
      return;
    }
    for (const receiver of [...receivers]) receiver(message);
  };

  return {
    signal: (event) => send({ kind: "signal", event }),
    fail: (event, message) => send(message === undefined ? { kind: "fail", event } : { kind: "fail", event, message }),
    connect(receiver) {
      receivers.add(receiver);
      const taken = held;
      held = [];
      return {
        held: taken,
        disconnect: () => {
          receivers.delete(receiver);
        },
      };
    },
  };
}
