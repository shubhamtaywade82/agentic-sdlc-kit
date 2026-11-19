// packages/mod-sdk/src/middleware/compose.ts
//
// Compose multiple handlers for the same event into a single handler.
// Handlers run in registration order. Each handler decides whether to
// call next(e) (observe/rewrite and forward) or return a result without
// calling next (answer).
//
// This lets a Mod register multiple policies for `tool.call` (e.g., a
// shell policy, a git policy, a migration policy) without each policy
// needing to know about the others.

import type { Handler, EventName, EventOf, ModsApi } from '../types/events.js';

export function compose<N extends EventName>(handlers: ReadonlyArray<Handler<N>>): Handler<N> {
  return async ($: ModsApi, e: EventOf<N>, next: (e: EventOf<N>) => Promise<unknown> | unknown) => {
    // Build the chain from the inside out: the last handler's next is the
    // caller's next; the previous handler's next is a function that calls
    // the last handler with the caller's next as its next; etc.
    let chain: (e: EventOf<N>) => Promise<unknown> | unknown = next;
    for (let i = handlers.length - 1; i >= 0; i--) {
      const h = handlers[i];
      if (!h) continue;
      const currentNext = chain;
      const currentHandler = h;
      chain = (ev: EventOf<N>) => currentHandler($, ev, currentNext);
    }
    return chain(e);
  };
}
