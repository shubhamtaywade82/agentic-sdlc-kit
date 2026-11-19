# @agentic-sdlc-kit/cli

The `kit` executable: user-facing entry point for the Agentic SDLC Kit.

## Usage

```bash
pnpm --filter @agentic-sdlc-kit/cli start -- --help
pnpm --filter @agentic-sdlc-kit/cli start -- --version
pnpm --filter @agentic-sdlc-kit/cli start -- doctor
```

Or, after `pnpm build`, run the bundled executable directly:

```bash
node packages/cli/dist/index.js --version
```

## Commands (M1)

- `kit --version` / `kit -v` — print the kit version.
- `kit --help` / `kit -h` / `kit help` — list commands.
- `kit doctor` — check the kit toolchain health (Node, pnpm, workspace).

## Architecture

- `src/commands/types.ts` — the `Command` interface.
- `src/commands/<name>.ts` — one file per command.
- `src/application/registry.ts` — the registry a dispatcher queries.
- `src/application/dispatcher.ts` — the only place that knows the full
  command list. Adding a command = adding one file + one registry entry.

See `docs/architecture/ARCHITECTURE.md` §2.3 and `REQUIREMENTS.md` FR-3.4.
