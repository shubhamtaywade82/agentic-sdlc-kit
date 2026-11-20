// plugins/run-observer/contract.d.ts
//
// Type contract for the Claude Code host: names the state keys this
// plugin writes on $.state. Self-contained by host rule (no imports).
// The store is the kit-internal TraceStore instance
// (plugins/run-observer/policies/trace-store.ts).
declare module 'claude-code' {
  interface PluginState {
    'run-observer': {
      store: unknown;
    };
  }
}
