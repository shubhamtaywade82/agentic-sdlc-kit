// plugins/secret-guard/contract.d.ts
//
// Type contract for the Claude Code host: names the state keys this
// plugin reads on $.state. Self-contained by host rule (no imports); the
// shape inlines RedactionPolicy from @agentic-sdlc-kit/contracts.
declare module 'claude-code' {
  interface PluginState {
    'secret-guard': {
      policy: {
        schemaVersion: 1;
        placeholderFormat: '[REDACTED]' | '[REDACTED:<kind>]' | '[REDACTED:<kind>:<id>]';
        redactPartial: boolean;
        redactRepeated: boolean;
        maxInputBytes: number;
        ignorePaths: string[];
      } | undefined;
    };
  }
}
