# Mod development

1. Create `mods/<id>` via `tooling/create-mod` (or by hand).
2. Declare capabilities in `.claude-plugin/plugin.json`: hooks, network, process,
   filesystem. CI fails if behavior exceeds the declaration.
3. Implement with `defineMod()` from `@agentic-sdlc-kit/mod-sdk`; bridge events via
   `@agentic-mods/sdlc-bridge`, never by importing core internals from UI code.
   Until the SDK exports `defineMod`, the scaffold mods carry a local stand-in
   helper (search for `marketplace-m2`).
4. Add tests with the MockRuntime from `@agentic-sdlc-kit/testing`; events must be
   replayable.
5. Run `pnpm verify` and `pnpm marketplace:validate`.

Three-state principle: every check reports PASS, FAIL or UNKNOWN — missing evidence
must never be reported as success.
