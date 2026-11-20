// plugins/sdlc-guard/contract.d.ts
//
// Type contract for the Claude Code host: names the state keys this
// plugin reads or writes on $.state. Self-contained by host rule (no
// imports); the shapes inline @agentic-sdlc-kit/contracts types.
declare module 'claude-code' {
  interface PluginState {
    'sdlc-guard': {
      // PolicyContext (contracts): interactive defaults to true; the host
      // or installer can override before the first event.
      context: { interactive: boolean } | undefined;
    };
  }
}
