# create-mod

Scaffolding CLI (next milestone). Usage target:

```bash
node tooling/create-mod/create.js --id my-mod --hooks tool.call,turn.complete
```

Generates package.json, tsconfig.json, .claude-plugin/plugin.json with a capability
manifest, and a src/index.ts defineMod() entry.
