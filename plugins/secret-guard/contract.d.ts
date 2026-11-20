// plugins/secret-guard/contract.d.ts
//
// Types contract for the Claude Code host (plugin.json's "types" field).
// Per the official grammar the contract is self-contained and declares
// ONLY what this plugin contributes to the host: its state keys
// (interface PluginState). Nouns on EngineInterface would be declared
// here too — secret-guard adds none. The engine merges this file's
// PluginState into the ambient 'claude-code' module.
//
// Everything else the hooks type against — the $ surface
// (EngineInterface) and the event inputs (*Input) — comes from the
// engine's own declarations, vendored for offline typechecks at
// .claude-plugin/types/claude-code/index.d.ts (the engine lays the full
// live file at that path whenever it loads this plugin) and re-laid by
// Claude Code in a real session.

declare module 'claude-code' {
  // The state keys this plugin reads on $.state (see hooks/register.ts:
  // every { plugin, key } literal used there is named here).
  interface PluginState {
    'secret-guard': {
      // RedactionPolicy (contracts): defaults ship in the module; the host
      // or installer can override before the first event.
      policy:
        | {
            schemaVersion: 1;
            placeholderFormat: string;
            redactPartial: boolean;
            redactRepeated: boolean;
            maxInputChars: number;
            ignorePaths: string[];
          }
        | undefined;
    };
  }
}
