# Claude Code Mods: Architecture, Creation & Interception Guide

Claude Code Mods are significantly more powerful than ordinary Claude Code hooks.

They let you insert JavaScript/TypeScript middleware inside Claude Code's execution pipeline. You can observe, modify, intercept, reject, or replace supported operations before Claude Code performs them.

This is particularly interesting for your agentic engineering kit because it gives you a way to implement:

- LLM model and effort routing.
- Tool-call governance.
- Prompt and context injection.
- Agent and subagent orchestration.
- Security policies.
- Execution tracing and usage analytics.
- Custom developer interfaces.
- Plugin governance.

The most important distinction:

> A Skill tells Claude how to do something. An MCP server gives Claude a tool. A Mod can intervene in how Claude Code operates.

These are complementary mechanisms, not replacements for one another.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

## 1. What exactly is a Claude Code Mod?

A Mod is a Claude Code plugin containing a JavaScript or TypeScript hooks module.

Its architecture looks like this:

Claude Code Runtime

Model · Tools · Prompts · Agents · UI · Sessions

Event interception

Mod Hooks Engine

Observe

Rewrite

Intercept

Your custom JavaScript / TypeScript handlers

Your policies

Routing, validation, security

Mods API

Tools, models, storage, UI

Continue Claude Code execution

Every hook receives three arguments:

```
export function register(on) {
  on('tool.call', async ($, e, next) => {
    // $    = Mods API
    // e    = event input
    // next = next middleware / Claude Code
  })
}
```

There are three fundamental interception behaviors.

| Behavior | Meaning                                                   |
| -------- | --------------------------------------------------------- |
| Observe  | Inspect the event and call `next(e)`                      |
| Rewrite  | Modify a copy of the event and call `next(modifiedEvent)` |
| Answer   | Return a result without calling `next()`                  |

The last behavior is especially important: it can prevent the normal operation or provide a result without executing the underlying tool.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

# 2. What all can you intercept?

The current official reference organizes the interception surface into several categories.

Here is the engineering-oriented breakdown.

## A. Tool interception

Highest practical value

These events let you intervene in the tools Claude uses.

| Event           | What you can intercept                  |
| --------------- | --------------------------------------- |
| `tool.call`     | Tool invocation, arguments and result   |
| `tool.check`    | Permission decision: allow, ask or deny |
| `tool.describe` | Tool description presented to the model |

### `tool.call`

Suppose Claude wants to execute:

```
git push origin main --force
```

You can inspect the command before it executes.

```
export function register(on) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (/git push.*--force/.test(e.command)) {
      return {
        deny: 'Force pushes are prohibited.'
      }
    }

    return next(e)
  })
}
```

Possible applications:

- Block destructive shell commands.
- Enforce Git workflow.
- Intercept file modifications.
- Restrict database operations.
- Inspect MCP tool calls.
- Modify tool arguments.
- Retry certain failed calls.
- Supply tool results without running the tool.
- Withhold results from Claude.

Important: `tool.call` also covers subagent and MCP tool calls. However, provider-side server tool uses that Claude Code does not itself execute are not exposed through `tool.call` or `tool.check`.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+2

### `tool.check`

This is the permission-control layer.

For example:

```
Claude requests a tool
        ↓
Your policy evaluates it
        ↓
Permission decision
        ↓
ALLOW / ASK / DENY
```

A useful policy:

| Operation              | Policy                       |
| ---------------------- | ---------------------------- |
| Read project files     | Allow                        |
| Run unit tests         | Allow                        |
| Edit source files      | Based on project permissions |
| Delete production data | Deny                         |
| Force push             | Deny                         |
| Publish package        | Ask                          |
| Modify CI/CD secrets   | Deny or require approval     |

Use native permission rules for static restrictions and `tool.check` for decisions that depend on runtime conditions, such as the current Git branch.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

### `tool.describe`

This is particularly interesting for agentic systems.

You can alter the tool description that the model receives.

For example:

```
Original:
Execute shell commands.

Modified:
Execute shell commands.
Never use this tool to modify production
or execute destructive operations.
Prefer project-specific tools when available.
```

You can also change whether an MCP tool is loaded upfront or deferred.

This opens up possibilities for dynamic tool discovery and tool-policy-aware prompting.

## B. Prompt interception

High practical value

This is where you can modify what Claude receives.

| Event                 | What it handles                          |
| --------------------- | ---------------------------------------- |
| `prompt.submit`       | Submitted user prompt                    |
| `prompt.fill`         | Text inserted into prompt input          |
| `prompt.suggest`      | Prompt suggestions                       |
| `prompt.edit`         | User edits prompt input                  |
| `prompt.autocomplete` | Autocomplete suggestions                 |
| `prompt.compose`      | System-prompt section composition        |
| `prompt.section`      | Individual prompt sections               |
| `prompt.context`      | Initial conversation context             |
| `prompt.attachment`   | Claude Code-generated prompt attachments |
| `prompt.mention`      | Files referenced through `@` mentions    |
| `skill.prompt`        | Expanded skill instructions              |
| `attribution.text`    | Commit/PR attribution text               |

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

### Example: Automatically inject project context

A developer enters:

```
Implement authentication.
```

Your mod can append:

```
Project context:
- Architecture: Modular monolith
- Backend: Rails API
- Frontend: React TypeScript
- Testing: RSpec
- Required workflow: TDD
- Security policy: OWASP-oriented checks
```

Implementation:

```
on('prompt.submit', async ($, e, next) => {
  const context = [
    ...(e.context ?? []),
    'Follow the project architecture.',
    'Use TDD for implementation.',
    'Run relevant tests before completion.'
  ]

  return next({
    ...e,
    context
  })
})
```

This is useful for your development kit because you can inject consistent engineering policies without repeatedly asking users to include them.

You can also drop a submitted prompt or alter the prompt before it reaches the model.

## C. Model interception and LLM routing

Critical for your LLM router

This is the part I would investigate first.

Three events matter:

| Event           | Purpose                                |
| --------------- | -------------------------------------- |
| `turn.start`    | Detect a new turn                      |
| `turn.step`     | Intercept an individual model request  |
| `turn.complete` | Observe or annotate the completed turn |

A single turn can contain multiple model requests because Claude may call tools and request additional model responses.

The crucial feature is `turn.step`.

The official API allows you to change:

- Model selection.
- Reasoning effort.
- The request forwarded to the next handler.

The event is an asynchronous generator because model output streams.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

### Example: Model + effort routing

```
export function register(on) {
  on('turn.step', async function* ($, e, next) {
    const route = await selectRoute(e)

    yield* next({
      ...e,
      model: route.model,
      effort: route.effort
    })
  })
}
```

Here, `selectRoute` is your own routing implementation, not a Claude Code built-in.

Your decision can look like:

```
{
  "task": "simple_code_edit",
  "model": "sonnet",
  "effort": "low"
}
```

Or:

```
{
  "task": "architecture_review",
  "model": "opus",
  "effort": "high"
}
```

The routing engine could consider:

- Task type.
- Complexity.
- Failure history.
- Latency budget.
- Cost budget.
- Required verification.
- User-selected model constraints.

The key point: you can implement the model-and-effort routing policy as a Mod instead of modifying every individual agent.

One caveat: model choice must remain compatible with the model/provider configured for the session and its available capabilities.

## D. Agent and subagent interception

This is another major capability.

| Event         | What it does                              |
| ------------- | ----------------------------------------- |
| `agent.offer` | Decide whether a subagent type is offered |
| `agent.spawn` | Intercept a subagent before it starts     |

For example, imagine Claude creates three agents:

```
Main Agent
   |
   ├── Research Agent
   ├── Coding Agent
   └── Testing Agent
```

Your mod can select models for individual agents.

```
on('agent.spawn', async ($, e, next) => {
  const model = e.name === 'researcher'
    ? 'sonnet'
    : 'opus'

  return next({
    ...e,
    model
  })
})
```

The example assumes your subagent metadata exposes the `name` field as expected by your installed version's types; validate the exact event shape before using it.

Other possibilities:

- Restrict which agent types can start.
- Assign different models to different agents.
- Limit agent proliferation.
- Apply different policies to agent-team teammates.
- Record agent lifecycle and status.
- Prevent unapproved subagents from running.

`agent.spawn` can also run when a subagent resumes. Account for that so you don't incorrectly count a resumed agent as a new one.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

## E. Session and conversation interception

These events give you control over session lifecycle and conversation records.

| Event             | Interception capability              |
| ----------------- | ------------------------------------ |
| `session.start`   | Session initialization               |
| `session.end`     | Session termination                  |
| `session.compact` | Context compaction                   |
| `session.receive` | Incoming inter-agent/session message |
| `session.send`    | Outgoing inter-agent/session message |
| `session.append`  | Conversation row before storage      |
| `session.attach`  | Another application attaches         |
| `session.detach`  | Another application disconnects      |
| `session.measure` | Session usage measurements           |

Examples:

Context governance

- Monitor context-window consumption.
- Maintain summaries before compaction.
- Record session metrics.
- Track token usage.
- Customize conversation records.

Multi-agent messaging governance

- Inspect messages between agents.
- Prevent specific messages from being delivered.
- Maintain structured agent communication.
- Add metadata to conversation records.

The ability to intercept `session.append` is especially useful for audit and redaction workflows, although modifying stored conversation content should be treated cautiously.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

## F. UI interception and customization

You can modify existing UI components or create your own interface elements.

Available events include:

| Event        | Purpose                               |
| ------------ | ------------------------------------- |
| `ui.render`  | Render or modify interface components |
| `ui.resolve` | Resolve UI element definitions        |
| `ui.press`   | Handle button interaction             |
| `ui.input`   | Handle input changes                  |
| `ui.select`  | Handle selections                     |
| `ui.focus`   | Handle focus changes                  |
| `ui.scroll`  | Handle scrolling                      |
| `ui.close`   | Handle pane closing                   |
| `ui.message` | Receive messages from custom UI       |
| `ui.fault`   | Observe custom UI failures            |

Supported render components include:

- `Pane`
- `AbovePrompt`
- `Spinner`
- `AssistantMessage`
- `UserMessage`
- `ToolUse`
- `ToolResult`
- `ToolGroup`
- `AskUserQuestion`
- `CommandOutput`
- `TurnDuration`
- `PromptHint`
- `InfoNotice`

The available components vary by application surface and Claude Code version.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

### Example: Build an agent dashboard

Agent Runtime Monitor

Illustrative UI

# 04

Active agents

# 23

Tool calls

# Sonnet

Current model

# Medium

Effort level

Execution pipeline

1. Planning

   Completed

2. Implementation

   Completed

3. Testing

   Running

4. Verification

   Pending

Illustrative dashboard, not live Claude Code telemetry.

You could build this with `ui.render`, `$.ui.open`, `$.ui.resolve`, and the UI interaction events.

One limitation: Claude Code documents extensive UI customization, but the permission prompt itself cannot be restyled by a user mod.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

## G. Commands and configuration interception

| Event              | Capability                                     |
| ------------------ | ---------------------------------------------- |
| `command.run`      | Intercept custom or registered commands        |
| `command.describe` | Change command descriptions                    |
| `config.set`       | Inspect, modify or deny a configuration change |
| `config.describe`  | Customize configuration descriptions           |
| `settings.read`    | Intercept settings reads                       |

For example, create custom developer commands:

```
/mod-audit
/mod-cost
/mod-security
/mod-reset
/mod-route
/mod-doctor
```

These can execute their own JavaScript functions instead of requiring Claude to make another LLM request.

That is useful for fast, deterministic operations.

## H. Other mods and plugin interception

This is an advanced extension point.

| Event             | Capability                                       |
| ----------------- | ------------------------------------------------ |
| `plugin.register` | Refuse another mod before its hooks module loads |
| `engine.create`   | Extend or restrict the Mods API exposed to a mod |

You could use `plugin.register` to implement a mod governance mechanism.

For example:

```
Plugin installation
       |
       ▼
Mod registration
       |
       ▼
Inspect declared capabilities
       |
       ├── Approved → Load
       └── Rejected → Refuse
```

`e.uses` exposes information such as registered events, API calls, environment-variable access and state usage.

This is useful when developing an enterprise mod ecosystem.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

## I. Intercepting Mods API calls

There is another layer that is easy to overlook.

Every Mods API method is itself an interceptable event.

For example:

| API namespace    | What it exposes                |
| ---------------- | ------------------------------ |
| `fs.read`        | File reads                     |
| `fs.write`       | File writes                    |
| `http.fetch`     | HTTP requests                  |
| `process.run`    | Process execution              |
| `process.spawn`  | Process spawning               |
| `model.complete` | Model completion calls         |
| `tool.call`      | Tool execution through the API |
| `ui.open`        | UI opening                     |
| `state.set`      | Reactive state updates         |

You can intercept these API calls to monitor or restrict what another mod does.

For example, conceptually:

```
on('fs.write', async ($, e, next) => {
  if (isProtectedPath(e.path)) {
    return {
      deny: 'Writing to this path is prohibited.'
    }
  }

  return next(e)
})
```

The exact event payload must be taken from your installed version's type declarations.

Special case: `http.fetch`. It has support for intercepting requests made through the Mods API. There are also pathways involving Claude Code's own HTTP requests, but those are subject to the built-in security guard and organizational restrictions. Do not assume an ordinary user-installed mod can inspect or rewrite all model-provider traffic.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

# 3. Complete interception map

Here is the consolidated view.

| Layer         | Events                                              | Primary use                        |
| ------------- | --------------------------------------------------- | ---------------------------------- |
| Tools         | `tool.call`, `tool.check`, `tool.describe`          | Tool governance                    |
| Prompts       | `prompt.*`, `skill.prompt`, `attribution.text`      | Prompt engineering                 |
| Models        | `turn.start`, `turn.step`, `turn.complete`          | Model routing                      |
| Agents        | `agent.offer`, `agent.spawn`                        | Agent orchestration                |
| Sessions      | `session.*`                                         | Lifecycle and context              |
| UI            | `ui.*`                                              | Interface extensions               |
| Commands      | `command.*`                                         | Custom commands                    |
| Configuration | `config.*`, `settings.read`                         | Configuration governance           |
| Plugins       | `plugin.register`, `engine.create`                  | Mod governance                     |
| Telemetry     | `telemetry.log`, `telemetry.mark`                   | Telemetry                          |
| API calls     | `fs.*`, `http.*`, `model.*`, `process.*` and others | Capability governance              |
| Legacy hooks  | `classic.*`                                         | Existing settings-hook integration |

This is the published event surface, not a guarantee that every event is available in every version or every application. The installed Claude Code type declarations are the final authority.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+2

# 4. How to create a Claude Code Mod

Now let's use your uploaded `claude-code-mod-template.zip`.

I inspected all six files.

claude-code-mod-template.zip

Extracted source structure

&#x20;mod-template/

&#x20;my-mod/

&#x20;`.claude-plugin/`

&#x20;`plugin.json`

&#x20;`hooks/`

&#x20;`hooks.json`

&#x20;`register.js`

&#x20;`tests/`

&#x20;`my-mod.test.ts`

&#x20;`README.md`

&#x20;`scripts/`

&#x20;`check.sh`

### Step 1 — Understand the three required files

1\. `plugin.json`

```
{
  "name": "my-mod",
  "version": "0.1.0",
  "description": "My first Claude Code mod",
  "author": {
    "name": "Nemesis"
  },
  "license": "MIT"
}
```

This identifies your plugin.

2\. `hooks.json`

```
{
  "description": "My mod hooks",
  "modules": ["./register.js"]
}
```

The `modules` property tells Claude Code that this plugin has a Mods API hooks module.

3\. `register.js`

This is where the actual interception logic lives.

```
export function register(on) {
  on('tool.call', async ($, e, next) => {
    $.ui.log(`Tool requested: ${e.tool}`)

    return next(e)
  })
}
```

These three files form the minimum structure.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

### Step 2 — Run your uploaded template

Requirements stated in your template:

- Claude Code 2.1.287 or later.
- Its author tested it against 2.1.328.

From the extracted `mod-template` directory:

```
claude --version

claude plugin validate ./my-mod

claude plugin test ./my-mod

claude --plugin-dir ./my-mod
```

Inside Claude Code:

```
/plugin
/my-mod-tally
/my-mod-usage
```

The starter implements:

1. Tool-call counting.
2. Live spinner modification.
3. `/my-mod-tally` command.
4. `/my-mod-usage` command.

The tests mock tool execution and verify that the tally reports two calls.

The supplied `scripts/check.sh` wraps validation and testing. The template uses the Claude Code-provided testing library; a separate build step is not required.

### Step 3 — Understand the starter's limitations

There are some important details in the uploaded implementation.

| Finding              | Assessment                                                       |
| -------------------- | ---------------------------------------------------------------- |
| Module-level counter | Resets when module reloads                                       |
| Tool-call tally      | Counts attempted calls, not only successful calls                |
| Usage command        | Not tested by the supplied test                                  |
| Tool guard           | Present only as a commented example                              |
| UI                   | Modifies the spinner; no dashboard                               |
| Error handling       | Includes a fail-open example and a commented fail-closed pattern |
| License              | Manifest says MIT, but ZIP contains no actual `LICENSE` file     |
| Distribution         | No release or marketplace workflow                               |

This is a good learning scaffold. It is not yet a production SDK.

# 5. Critical: Security limitations of Mods

This is where I would be strict.

Mods execute with your permissions. They are not sandboxed.

A mod can potentially:

- Read files accessible to your account.
- Read environment variables and secrets.
- Execute processes.
- Make network requests.
- Read prompts and tool calls.
- Modify submitted prompts and tool arguments.
- Submit prompts or send messages to sessions.
- Influence tool permission decisions.

The built-in security guard and organizational policies limit certain capabilities, but you should not treat a user-installed mod as a security boundary.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

### Five rules I would enforce

1\. Fail-closed for critical guards.

A critical guard must not silently allow an operation when the hook crashes or times out.

Claude Code normally skips a failed or timed-out hook. Use its `.catch()` handler to implement the appropriate rejection behavior. Your starter already demonstrates the distinction between fail-open and fail-closed handling.

2\. Never assume rejecting after execution rolls back a side effect.

This is dangerous:

```
const result = await next(e)

// The original tool may already have executed.
return { deny: 'Not allowed' }
```

The result is withheld, but an executed operation is not undone.

3\. Do not rely on regex as your security engine.

Use proper argument parsing, allowlists, path validation and dedicated policies. Shell commands are especially difficult to validate using string matching.

4\. Keep hook execution fast.

Official documented limits include:

- 10 seconds per hook.
- 50 milliseconds for `prompt.edit`.
- 1 second for a `.catch()` handler.

External services and complex analysis should not block every tool invocation.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

5\. Validate before installing.

```
claude plugin validate ./my-mod
```

Inspect the reported hooks and API calls, then inspect the source code itself.

Static validation identifies declared capabilities; it does not prove that a mod is safe or that its behavior is correct.

# 6. How I would architect your Mod SDK

Your earlier assessment identified that the development kit needs executable tooling, governance, testing and distribution.

I would make Mods a first-class extension layer within that kit.

Do not create one giant `register.js` containing everything.

Instead, organize features around responsibilities.

## Agentic Development Kit

Proposed modular architecture

Claude Code Plugin

Manifest · Configuration · Dependencies

Mod Runtime

Governance Mod

Tool interception and security

Routing Mod

Model and effort selection

Observability Mod

Usage, costs, execution logs

Dashboard Mod

Custom developer UI

Context Mod

Prompt and context management

Agent Mod

Subagent policies and orchestration

Shared SDK / Policy Layer

Contracts · State · Configuration · Validation · Telemetry

### Suggested repository structure

```
claude-agentic-kit/
│
├── .claude-plugin/
│   └── plugin.json
│
├── hooks/
│   ├── hooks.json
│   │
│   ├── register.js
│   │
│   ├── mods/
│   │   ├── governance/
│   │   │   ├── register.js
│   │   │   ├── tool-policy.js
│   │   │   └── path-policy.js
│   │   │
│   │   ├── routing/
│   │   │   ├── register.js
│   │   │   ├── classifier.js
│   │   │   ├── model-router.js
│   │   │   └── escalation.js
│   │   │
│   │   ├── observability/
│   │   │   ├── register.js
│   │   │   └── usage-tracker.js
│   │   │
│   │   ├── context/
│   │   │   ├── register.js
│   │   │   └── context-injector.js
│   │   │
│   │   └── dashboard/
│   │       ├── register.js
│   │       └── components.js
│   │
│   └── shared/
│       ├── contracts/
│       ├── policies/
│       └── utils/
│
├── commands/
├── agents/
├── skills/
├── scripts/
├── tests/
├── references/
│
├── package.json
├── LICENSE
├── CHANGELOG.md
└── README.md
```

One implementation detail: each module should expose a `register(on)` function, and the root hooks module should import and register them. Keep event registrations unique for each event/matcher combination.

You don't need a Node.js package or bundler merely to load a basic mod, but a governed TypeScript development toolchain makes sense for a larger SDK.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

# 7. Which Mods should you build first?

My proposed priority for your kit:

| Priority | Mod               | Core events                                       |
| -------- | ----------------- | ------------------------------------------------- |
| P0       | Security Guard    | `tool.call`, `tool.check`                         |
| P0       | Execution Auditor | `tool.call`, `turn.complete`                      |
| P1       | LLM Router        | `turn.step`, `agent.spawn`                        |
| P1       | Context Manager   | `prompt.submit`, `prompt.context`, `skill.prompt` |
| P1       | Usage Tracker     | `turn.step`, `session.measure`                    |
| P2       | Agent Dashboard   | `ui.render`, `ui.press`, `ui.input`               |
| P2       | Plugin Governance | `plugin.register`                                 |

I would build Security Guard first, followed by LLM Router and Execution Auditor.

Those three give you the foundations of a governed agent runtime.

## 8. Your earlier four-level LLM routing strategy

This is where the Mod architecture becomes interesting.

LLM routing lifecycle

User submits task

prompt.submit

Task classification

Complexity · Risk · Budget

Model and effort selection

turn.step

Model executes

Tools · MCP · Subagents

Verification

Tests · Lint · Policy · Evidence

PASS

Complete

FAIL

Escalate

The important architectural distinction is that routing and verification are separate concerns.

- `turn.step` handles model selection and effort.
- `tool.call` and `tool.check` govern execution.
- `turn.complete` provides completion information.
- Your verification engine performs actual quality checks.
- The escalation mechanism decides whether another attempt is justified.

Do not treat an LLM's confidence score as proof of correctness.

# 9. What I recommend you build into the SDK

There are three distinct products hiding inside your original development-kit proposal:

| Product layer           | Responsibilities                                         |
| ----------------------- | -------------------------------------------------------- |
| Instruction layer       | Agents, Skills, Commands, Templates                      |
| Runtime extension layer | Mods, Hooks, Model routing, Tool interception            |
| Engineering layer       | Tests, Validators, Installers, CI/CD, Release management |

The second layer is what your existing template starts to introduce.

I would also introduce an explicit capability manifest for your own mods:

```
type ModCapabilities = {
  hooks: string[]
  apiAccess: string[]
  filesystemAccess: string[]
  networkAccess: boolean
  processExecution: boolean
  modifiesPrompts: boolean
  modifiesToolCalls: boolean
  modifiesModels: boolean
}
```

This would be your SDK's own policy model, not a replacement for Claude Code's plugin manifest.

It gives your installer, validator and security auditor a consistent contract to inspect before a mod is enabled.

# 10. Official resources to study

These are the primary resources I would use rather than relying on outdated community examples.

1. [Mods overview](https://code.claude.com/docs/en/plugins/mods?utm_source=chatgpt.com) — architecture and capabilities.
2. [Create a Mod](https://code.claude.com/docs/en/plugins/mods/create?utm_source=chatgpt.com) — creation and loading.
3. [React to events](https://code.claude.com/docs/en/plugins/mods/events?utm_source=chatgpt.com) — interception and middleware.
4. [Complete Mods API reference](https://code.claude.com/docs/en/plugins/mods/reference?utm_source=chatgpt.com) — event, API, UI and limits.
5. [Anthropic sample Mods](https://github.com/anthropics/claude-code-playground/tree/main/claude-code/mods?utm_source=chatgpt.com) — reference implementations.

Version warning: The documentation reference describes different coverage baselines for CLI/Desktop and VS Code. Always inspect the `.claude-plugin/types/` declarations generated by the Claude Code version you are actually running.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

## My recommendation: Build a Mod Development Framework, not just individual Mods

I would make the next major milestone:

`claude-agentic-mod-sdk`

It should provide:

- Typed event registration.
- Reusable middleware.
- Model routing policies.
- Tool governance policies.
- Structured audit events.
- State management.
- Testing utilities.
- Static capability analysis.
- Version compatibility checks.
- Installation and removal lifecycle.

The most important design decision is to keep the policy engine independent from Claude Code's event handlers. That way, you can test routing, authorization and escalation as ordinary TypeScript modules without launching Claude Code.

One distinction to preserve: Claude Code Mods are a Claude Code-specific integration. Your core routing, governance and verification logic should remain portable so that Nexum or another agent runtime can reuse it without depending on Claude Code's internal event model.

## Review verdict: TypeScript conversion is a good improvement

I inspected the actual `claude-code-mod-template-ts.zip`, including all eight files.

Approved as a starter

Not release-ready yet

### 1. What is correct

| Area            | Assessment                                |
| --------------- | ----------------------------------------- |
| `register.ts`   | Correct TypeScript entry point            |
| `Register` type | Good use of official API types            |
| `hooks.json`    | Correctly references TypeScript           |
| `tsconfig.json` | Strict type checking                      |
| Test file       | Uses `claude-code/testing`                |
| `.gitignore`    | Correctly excludes generated declarations |
| `check.sh`      | Correct validation sequence               |

Anthropic's own Mods repository uses the same TypeScript-first architecture and `claude-code/testing` test infrastructure.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com&sz=32)

GitHub

### 2. Issues I would address

P1 — Cross-version compatibility is not fully proven.

Your verification covers:

- Runtime validation/testing on Claude Code 2.1.328.
- Static TypeScript compilation against newer declarations.

These are two different checks.

Add a CI matrix covering the minimum supported version and latest available version. The Mods API is still documented as early access and may change between releases.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com&sz=32)

GitHub

P1 — `/my-mod-usage` has no regression test.

Add tests for:

- Context usage returned correctly.
- Empty rate-limit data.
- Multiple rate-limit windows.
- Missing or unexpected usage data.

P1 — TypeScript should be a mandatory CI dependency.

Currently:

```
if [[ -f "$TYPES" ]] && command -v tsc >/dev/null 2>&1; then
  tsc -p "$MOD_DIR"
else
  echo "skipped..."
fi
```

This can report success without TypeScript verification.

For CI, pin TypeScript locally and require the type-check to pass.

P2 — Missing LICENSE file.

The manifest declares MIT, but the archive does not contain an actual `LICENSE` file. Add it before distribution.

P2 — Clarify counter semantics.

The counter increments before `next(e)`, meaning it counts attempted tool calls, including calls that subsequently fail or are denied.

Rename the displayed metric to `tool-call attempts`, or document that behavior.

## 3. What I independently verified

JSON manifests

Passed

Shell syntax

Passed

Executable permission on check.sh

Present

Claude plugin validation

Not independently rerun

Runtime plugin tests

Not independently rerun

TypeScript API compatibility

Not independently rerun

This environment does not have the Claude CLI, and the ZIP intentionally excludes generated API declarations.

## 4. What I recommend building next

Don't stop at the starter template. Use it as the foundation for a proper TypeScript Mod SDK.

My proposed implementation sequence:

| Phase | Deliverable                                |
| ----- | ------------------------------------------ |
| M1    | Typed Mod SDK and reusable middleware      |
| M2    | Tool governance and security policies      |
| M3    | Model + effort router                      |
| M4    | Verification and escalation engine         |
| M5    | Agent orchestration and context management |
| M6    | Runtime observability dashboard            |
| M7    | CI, compatibility matrix and distribution  |

One architectural decision is particularly important: Keep the business logic independent of Claude Code's event API. The Mod should be an adapter around reusable TypeScript modules.

That will let the same routing, verification and governance logic eventually work inside Nexum and other agent runtimes.

My recommendation: proceed with M1, but don't introduce the LLM router until the SDK's middleware, contracts and test infrastructure are established.

# Review: `hamzafer/claude-code-mods`

Strong reference

TypeScript

Audit before adopting guards

Repository: [https://github.com/hamzafer/claude-code-mods](https://github.com/hamzafer/claude-code-mods?utm_source=chatgpt.com)

My assessment: this is one of the most useful reference repositories for the Mod SDK you are planning. It demonstrates several real-world implementations of the interception mechanisms, not merely examples of registering callbacks.

The repository contains:

- 31 individual mods in its marketplace catalogue.
- TypeScript/TSX implementations.
- An interactive installation CLI.
- Per-mod configuration.
- Automated behavioral tests.
- CI validation against a pinned Claude Code version.
- Documentation, screenshots and installation instructions.

The CLI package is `claude-code-mods` (version 0.4.2 in the inspected manifest), requiring Node.js 18+.

## 1. Six references worth studying first

These are the ones I would prioritize for your SDK.

[BridgeMind (@bridgemindai) on X](https://images.openai.com/static-rsc-4/pi0BQ6ztUA_RwC4hxYHwEHGy8P3KBFA0MeV86bikeEwhznIemP2gbkq-kWKaPj4bnOE5jXbs9elm7Z_JwWeCk6mdoBE9cXPcTgrnxvbHzl7XK_q7IpxqAXbkd_Yhms6Y1D0YOGGfUo1cMuI_XUuxjMABCSkLAywNN2PrRqVoZ9g?purpose=inline)

1\. Switchboard — LLM routing

P0 for your router

[Source code](https://github.com/hamzafer/claude-code-mods/tree/main/mods/switchboard?utm_source=chatgpt.com)

Uses `agent.spawn` to select a model for subagents. Supports a model ladder, external decision providers, confidence threshold, suggest/automatic modes and cost tracking.

[Nyk 🌱 (@nyk_builderz) on X](https://images.openai.com/static-rsc-4/D1TXy8kXEeB-xTbSAInFATzKRX0tYvAwsWh_TYf3DiYNKMwWTS-aG4ZfyZYA98B_y9XFbB_c1r0WNHVxGXUX7mbjgqHRWhDv3mgs7BAcQRLTst7W3R3f5qWrWZDa2yYyA3-I57FjEMtQxO_KkNQmwkT0f81otaNP5RZK9t5Anss?purpose=inline)

2\. Mission Control — Agent observability

P0 for runtime observability

[Source code](https://github.com/hamzafer/claude-code-mods/tree/main/mods/mission-control?utm_source=chatgpt.com)

Tracks main agents, subagents, tool calls, file operations and execution lifecycle. Uses host-backed reactive state.

[sk-...を書く前に止める ― Claude Codeのguard-secrets hookでつくる最後の関所](https://images.openai.com/static-rsc-4/T36L0azfbCHWDjN7zQMcTwVlbIVO1rsOxqM80bNw04BNsj-aS-NBKtwj3vjQBv_gEjQ7FngsqZm3O5uFQ5SxE2W24lGkfdk7KVqX6yTmPWFV54qkbI3v1PnkQTj5OJezuVOwR0jlh2ycf8jyTWbB-ig2OG090yN6qqxIBFyGjXE?purpose=inline)

3\. Secret Guard — Data protection

P0 for security

[Source code](https://github.com/hamzafer/claude-code-mods/tree/main/mods/secret-guard?utm_source=chatgpt.com)

Redacts secrets from tool results, checks writes and inspects Git commit/push diffs. Uses built-in patterns and optional Gitleaks.

[Mastering Claude Code’s /btw, /fork, and /rewind: The Context Hygiene Toolkit | by Rick Hightower | Mar, 2026 | Medium](https://images.openai.com/static-rsc-4/jv-gFc0LJO4zpKi0ZMa0aO8KmjbYOshOR4PEiSXcPO5rxHRrw08DnAoJzELQl_riTtADYryZLseVoPr4lS_cwN9bg3kiVnhQOhIZBIinJjz2rBGDBoqvw15m5_1DXa3JytUWD8EQK8MSOTpRy1bUkcflEfCwdbBiDZWfrqpJUOQ?purpose=inline)

4\. Blast Radius — Human approval

P0 for execution governance

[Source code](https://github.com/hamzafer/claude-code-mods/tree/main/mods/blast-radius?utm_source=chatgpt.com)

Holds destructive commands, previews their impact, and requires explicit approval. Unanswered operations are cancelled.

[Claude Code 101](https://images.openai.com/static-rsc-4/yid43iQ-HTD6VdiEWD_2enOE9F5R3IDVTJASQrxVxnnKnENHv9CV88z98HQaD51BDitcJ1qz5NRy13UlQ-8k6aYtU62WeCjzxlJrlqW5zFxh8hmQt8hx_m4DS7esRfnys0T0JHgRxV1p58F8Wik660S0f_uxh9lOqttocRXYDC4?purpose=inline)

5\. Review Watch — External review integration

P1

[Source code](https://github.com/hamzafer/claude-code-mods/tree/main/mods/review-watch?utm_source=chatgpt.com)

Tracks Codex reviews and review subagents, their execution status, output and findings.

[Claude Code \`/context\` Visualizes Context Window, Token Usage, MCP Calls, and Memory Files | Vibe Sparking AI](https://images.openai.com/static-rsc-4/nPk0mthc6r1IChxuo6nqfQsMgy15-iQCSrYHA1eoHRPVPtqRTDOzZD965CgIB_woPrBm8Ig3Z4R7Rf6HA43s5rTIWzIM_P_zJdNNWn1J0FxbrVWw9BfG3haVKjWeed8x0AHrv2zEzAPe1o3xySpI0SR3ZzDaSAWOr_v1Gk1NlpM?purpose=inline)

6\. Context Bar / Token Weather — Context management

P1

[Context Bar](https://github.com/hamzafer/claude-code-mods/tree/main/mods/context-bar?utm_source=chatgpt.com) · [Token Weather](https://github.com/hamzafer/claude-code-mods/tree/main/mods/token-weather?utm_source=chatgpt.com)

Displays context-window allocation, token usage, cache status and compaction information.

## 2. Most important: Switchboard architecture

This is directly related to your four-level LLM routing strategy.

Source files:

- [register.tsx](https://github.com/hamzafer/claude-code-mods/blob/main/mods/switchboard/hooks/register.tsx?utm_source=chatgpt.com)
- [route.ts](https://github.com/hamzafer/claude-code-mods/blob/main/mods/switchboard/hooks/route.ts?utm_source=chatgpt.com)
- [switchboard.test.tsx](https://github.com/hamzafer/claude-code-mods/blob/main/mods/switchboard/tests/switchboard.test.tsx?utm_source=chatgpt.com)

### How it works

```
Claude creates a subagent
          |
          v
      agent.spawn
          |
          v
     Switchboard
          |
          v
   Determine baseline model
          |
          v
    External AI picker
          |
          v
   Parse model selection
          |
          v
 Confidence >= 0.50?
       /       \
     Yes        No
      |          |
      v          v
  Apply model  Keep original
      |          |
      +-----+----+
            |
            v
       Spawn agent
            |
            v
      turn.complete
            |
            v
    Calculate usage/cost
```

### What I particularly like

A. Model selection is separated from orchestration.

`route.ts` handles:

- Model ladders.
- Decision API request construction.
- Response parsing.
- Confidence.
- Pricing calculations.

`register.tsx` handles Claude Code event integration.

This separation is worth reproducing.

B. The task prompt is not transmitted to the external picker.

The picker receives only:

```
{
  agent_type: input.subagentType,
  description: input.description
}
```

This is a useful data-minimization strategy. The description itself should still be treated as potentially sensitive.

C. Explicit fallback behavior.

- Picker unavailable: retain original model.
- No API key: retain original model.
- Low confidence: retain original model.
- Caller explicitly specifies a model: respect it by default.
- Suggest mode: show recommendation without changing execution.

D. Good test coverage.

The tests cover:

- Named model preservation.
- Picker failure.
- Low confidence.
- Different model ladders.
- Forks and teammates.
- API key selection.
- Cost accounting.
- Suggest mode.

### Important limitations

Do not confuse this with a complete LLM router.

| Capability                     | Switchboard |
| ------------------------------ | ----------- |
| Subagent model routing         | Yes         |
| Main-model request routing     | No          |
| Effort-level routing           | No          |
| External decision model        | Yes         |
| Confidence threshold           | Yes         |
| Verification-driven escalation | No          |
| Cost tracking                  | Yes         |

The implementation also deliberately avoids switching agents where it cannot determine their original model safely.

My recommendation: use Switchboard as the reference implementation for the `AgentModelRouter` adapter, not as your entire routing engine.

## 3. Security architecture: Secret Guard + Blast Radius

These two mods are especially relevant to your proposed P0 safety improvements.

### Secret Guard

Its implementation has three main enforcement points:

Secret Guard pipeline

Tool returns data

Output inspection

Scan tool results and context. Redact detected credentials before exposing the result to the model.

Write/Edit

Detect secrets before file changes.

Git commit/push

Scan changes that would enter Git history.

Allow · Redact · Ask · Deny

Particularly good implementation details:

- Optional local Gitleaks integration.
- Avoids exposing actual secret values in approval prompts.
- Checks git-ignored destinations.
- Handles oversized diffs conservatively.
- Uses argument arrays for process execution.
- Avoids executing repository-controlled Gitleaks configuration during scanning.

Review concern: I would add regression tests for multiple distinct secrets of the same type appearing in differently represented tool output. Its residual-output matching currently uses the finding's `kind` as a coverage check, rather than requiring the exact secret value to have been found. That deserves scrutiny before using it as a security foundation.

Also, optional scanner failures fall back to built-in rules. That is reasonable for an optional scanner, but a stricter security mode should support fail-closed behavior.

### Blast Radius

This is an excellent human-in-the-loop pattern.

It holds certain commands:

- `rm -rf`
- Git force pushes.
- Database migrations.

The user sees an impact preview and chooses whether to proceed.

Its tests are especially useful:

- Cancel prevents execution.
- Proceed executes the original command.
- Unresolved shell variables are not presented as an empty/safe preview.
- Commands time out and automatically cancel.
- Noninteractive sessions reject operations requiring approval.

One caveat: it recognizes a defined set of command patterns; it is not a complete shell parser or an execution sandbox.

References:

- [Blast Radius implementation](https://github.com/hamzafer/claude-code-mods/blob/main/mods/blast-radius/hooks/register.tsx?utm_source=chatgpt.com)
- [Blast Radius tests](https://github.com/hamzafer/claude-code-mods/blob/main/mods/blast-radius/tests/blast-radius.test.tsx?utm_source=chatgpt.com)

## 4. Mission Control: how to build observability

This is probably the best architectural reference for monitoring agentic workflows.

It listens to:

```
session.start
turn.start
agent.spawn
tool.call
turn.complete
ui.render
```

It builds a hierarchical runtime tree:

```
Main Agent
│
├── Agent: Research
│   ├── Read README
│   ├── Search files
│   └── Read configuration
│
├── Agent: Developer
│   ├── Read source
│   ├── Edit service
│   └── Write tests
│
└── Agent: Reviewer
    ├── Read diff
    └── Run tests
```

It also tracks:

- Execution status.
- Parent/child agent relationships.
- Files being touched.
- Changes to files.
- Tool-call lifecycle.
- Background agents continuing after the main turn.

A particularly good design decision is its bounded state: it caps the number of tracked nodes rather than retaining an unlimited execution history in reactive state.

It also uses host-backed `atom`, `read` and `update` operations to preserve state across hot reloads.

What I would extract: a reusable `ExecutionTrace` contract and an event-driven state store, independent of UI rendering.

Source: [mission-control/register.tsx](https://github.com/hamzafer/claude-code-mods/blob/main/mods/mission-control/hooks/register.tsx?utm_source=chatgpt.com).

# 5. Installer, SDK and testing references

Your original P0/P1 proposal included installer safety, symmetric lifecycle, packaging and tests.

This repository provides useful examples for several of those requirements.

| Your requirement          | Repository reference              | Assessment |
| ------------------------- | --------------------------------- | ---------- |
| Package distribution      | `cli/package.json`                | Good       |
| Interactive installer     | `cli/src/cli.js`                  | Good       |
| Dry-run mode              | `cli/src/cli.js`                  | Good       |
| Project/user installation | `cli/src/plan.js`                 | Good       |
| Third-party confirmation  | `cli/src/cli.js`                  | Good       |
| Per-mod configuration     | `cli/src/options.js`              | Good       |
| Marketplace metadata      | `.claude-plugin/marketplace.json` | Good       |
| Behavioral tests          | Each mod's `tests/`               | Good       |
| Version-pinned CI         | `.github/workflows/ci.yml`        | Good       |
| Uninstallation            | `cli/src/plan.js`                 | Incomplete |
| Full OS matrix            | CI                                | Incomplete |

### Important installer observation

Their installer supports:

```
npx claude-code-mods@latest
```

```
npx claude-code-mods@latest --dry-run
```

```
npx claude-code-mods@latest --project
```

```
npx claude-code-mods@latest --pick switchboard,secret-guard
```

They also explicitly warn before installing third-party community mods.

However, `plan.js` explicitly states:

> Never uninstalls.

It enables and disables mods but doesn't provide a complete installation manifest and uninstall lifecycle.

That means your proposed uninstall script is still worthwhile.

### CI approach

Their workflow:

1. Installs a pinned Claude Code version.
2. Validates the marketplace.
3. Checks shared helper consistency.
4. Discovers mod directories.
5. Runs `claude plugin validate`.
6. Runs `claude plugin test`.
7. Fails the build when a mod fails.

This is a good model for your own release workflow.

References:

- [CI workflow](https://github.com/hamzafer/claude-code-mods/blob/main/.github/workflows/ci.yml?utm_source=chatgpt.com)
- [Contributing guide](https://github.com/hamzafer/claude-code-mods/blob/main/CONTRIBUTING.md?utm_source=chatgpt.com)
- [CLI package](https://github.com/hamzafer/claude-code-mods/blob/main/cli/package.json?utm_source=chatgpt.com)
- [Installation planner](https://github.com/hamzafer/claude-code-mods/blob/main/cli/src/plan.js?utm_source=chatgpt.com)

# 6. How I would combine this with your TypeScript template

I would not copy the entire repository.

Instead, use it as the implementation reference for your own reusable SDK.

## Proposed Claude Agentic Mod SDK

Claude Code Adapter

Register · Event mapping · Host API

Reusable Mod Runtime

Routing Engine

Model + effort

Governance Engine

Tool authorization

Verification Engine

Tests + checks

Escalation Engine

Retry + fallback

Execution Trace

Agent + tool lifecycle

Context Manager

Prompt + context policy

Shared contracts and deterministic policies

Suggested source layout:

```
claude-agentic-mod-sdk/
│
├── packages/
│   ├── core/
│   │   ├── middleware/
│   │   ├── contracts/
│   │   ├── policies/
│   │   └── state/
│   │
│   ├── routing/
│   │   ├── classifier/
│   │   ├── model-router/
│   │   ├── effort-router/
│   │   └── escalation/
│   │
│   ├── verification/
│   ├── observability/
│   └── testing/
│
├── mods/
│   ├── governance/
│   ├── switchboard/
│   ├── mission-control/
│   ├── secret-guard/
│   ├── blast-radius/
│   └── review-gate/
│
├── examples/
├── scripts/
├── tests/
└── .github/workflows/
```

The important boundary:

- `packages/core` should not import `claude-code`.
- Each `mods/*` package adapts the core to Claude Code events.
- `packages/testing` should make event middleware testable without starting a Claude Code session.
- The SDK's installer should install only explicitly selected mods.

# 7. My implementation priority

I would revise your original milestones slightly based on these references.

| Priority | Deliverable                          | Reference                   |
| -------- | ------------------------------------ | --------------------------- |
| P0       | Typed middleware and test harness    | Template + Switchboard      |
| P0       | Tool governance                      | Secret Guard + Blast Radius |
| P1       | Model and effort router              | Switchboard                 |
| P1       | Execution event store                | Mission Control             |
| P1       | Verification and escalation          | Your own implementation     |
| P2       | Developer dashboard                  | Mission Control             |
| P2       | Installer and lifecycle              | Repository CLI              |
| P2       | Compatibility and release governance | Repository CI               |

## 8. One major feature missing from this repository

The most important missing architectural piece for your intended SDK is a generic verification-driven escalation engine.

Switchboard makes a routing decision before a subagent starts. It doesn't implement the four-level pipeline you described earlier.

I would add:

```
interface RoutingPolicy {
  model: string
  effort: "low" | "medium" | "high"
}

interface VerificationResult {
  passed: boolean
  failures: string[]
  evidence: string[]
}

interface EscalationPolicy {
  maxAttempts: number
  retryableFailures: string[]
  fallbackRoutes: RoutingPolicy[]
}
```

Execution:

```
Task
  ↓
Classify complexity + risk
  ↓
Select model + effort
  ↓
Execute
  ↓
Verify using deterministic checks
  ├── PASS → Complete
  └── FAIL → Classify failure
                 ↓
             Escalate
                 ↓
             Re-execute
                 ↓
             Verify again
```

This should be independent of Claude Code's particular `agent.spawn` event so it can eventually be reused by Nexum and your other agent runtimes.

## Final recommendation

Use as a primary reference repository

I would study these source files in this order:

1. [Switchboard](https://github.com/hamzafer/claude-code-mods/tree/main/mods/switchboard?utm_source=chatgpt.com) — routing design.
2. [Secret Guard](https://github.com/hamzafer/claude-code-mods/tree/main/mods/secret-guard?utm_source=chatgpt.com) — interception and data governance.
3. [Blast Radius](https://github.com/hamzafer/claude-code-mods/tree/main/mods/blast-radius?utm_source=chatgpt.com) — approval and cancellation.
4. [Mission Control](https://github.com/hamzafer/claude-code-mods/tree/main/mods/mission-control?utm_source=chatgpt.com) — event state and observability.
5. [Testing patterns](https://github.com/hamzafer/claude-code-mods/tree/main/mods/switchboard/tests?utm_source=chatgpt.com) — mocked runtime behavior.
6. [CLI and CI](https://github.com/hamzafer/claude-code-mods/tree/main/cli?utm_source=chatgpt.com) — distribution and lifecycle.

My architectural decision: Keep your TypeScript template as the minimal Mod starter, and evolve it into a separate SDK using these implementations as references. Do not turn the starter into a monolith or blindly import every mod.

The target should be a reusable, testable, policy-driven Mod framework with Claude Code as its first runtime adapter.

# Architecture proposal: Agentic SDLC Kit

We should build one opinionated, modular AI Software Development Kit, with our own Claude Code Mods library as its runtime-control layer.

Not another collection of prompts. Not 30 independent agents. Not a marketplace full of decorative dashboards.

The objective is to build a system that can take either:

1. A new application idea and turn it into a designed, tested, documented and releasable application.
2. An existing application and deliver a complete feature incrementally, without damaging existing functionality.
3. A bug, architectural problem or technical debt item and resolve it through a controlled engineering workflow.

The system should use LLMs for reasoning, deterministic scripts for verification, design patterns when justified, and runtime Mods for enforcement and observability.

My recommendation is to call the project Agentic SDLC Kit for now.

## 1. First, establish the architecture boundaries

There is an important distinction we must preserve.

A Claude Code Mod is not a replacement for a Skill, an Agent, an MCP server or an engineering script.

Each has a different responsibility.

## Agentic SDLC Kit

1\. Intelligence layer

Skills · Agents · Commands · Design pattern knowledge

Determines what work should happen and how it should be performed.

2\. Engineering automation layer

TypeScript scripts · Validators · Test runners · CLI

Performs deterministic operations and produces verifiable evidence.

3\. Runtime governance layer

Claude Code Mods · Tool policies · Model routing · Lifecycle observers

Controls execution, intercepts supported events and enforces runtime policies.

4\. Engineering knowledge and state

Specifications · ADRs · Plans · Tasks · Test evidence · Release records

Preserves decisions and work state across sessions.

The separation matters because Claude Code itself distinguishes the responsibilities of Skills, subagents and hooks, including when they consume context and how they operate. Skills are loaded on demand, whereas root `CLAUDE.md` instructions consume context throughout the session. We should design around that distinction rather than loading our entire kit into every conversation.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://claude.com&sz=32)

Claude by Anthropic+1

# 2. The product should have three installable components

I would avoid shipping everything as one massive plugin.

Instead:

| Component      | Responsibility                                             | Installation |
| -------------- | ---------------------------------------------------------- | ------------ |
| `sdlc-core`    | Engineering workflows, Skills, Agents, Commands, templates | Default      |
| `sdlc-runtime` | Mods for routing, security, governance and observability   | Optional     |
| `sdlc-stacks`  | Language/framework-specific engineering knowledge          | Selective    |

All three should be distributed through one marketplace and governed by one versioning and compatibility policy.

### A. SDLC Core

This is the actual development kit.

Contains:

- SDLC workflows.
- Project discovery.
- Application architecture.
- Design patterns.
- TDD/BDD.
- Feature implementation.
- Code review.
- Security and quality standards.
- Documentation and release procedures.
- Deterministic validation scripts.

### B. Runtime Mods

This is our custom Mods library.

It should contain only capabilities that genuinely need runtime interception.

I would start with four Mods:

| Mod            | Responsibility                                                        |
| -------------- | --------------------------------------------------------------------- |
| `sdlc-guard`   | Destructive operations, protected files, Git and migration governance |
| `model-router` | Model and effort routing for main requests and subagents              |
| `secret-guard` | Secret detection, redaction and write/commit/push checks              |
| `run-observer` | Agent, tool, execution and cost observability                         |

These cover most of the useful functionality demonstrated by Hamza's repository without copying its collection of unrelated utilities.

### C. Stack Packs

Do not create a separate SDLC system for every programming language.

Create reusable stack profiles:

- Node.js / TypeScript.
- React / TypeScript.
- Ruby on Rails.
- Python / FastAPI / Django.
- Go.
- PostgreSQL / MySQL / MongoDB.

A stack pack supplies technology-specific patterns, test commands, architecture references and examples. The underlying SDLC workflow remains the same.

# 3. Repository architecture

I recommend a TypeScript monorepo, with independently installable plugins and reusable packages.

```
agentic-sdlc-kit/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── security.yml
│       └── release.yml
│
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── contracts/
│   │       ├── project-profile/
│   │       ├── workflow/
│   │       ├── policy/
│   │       └── verification/
│   │
│   ├── cli/
│   │   └── src/
│   │       ├── commands/
│   │       ├── discovery/
│   │       ├── installer/
│   │       └── release/
│   │
│   ├── testing/
│   │   └── src/
│   │       ├── fixtures/
│   │       ├── validators/
│   │       └── test-helpers/
│   │
│   └── claude-code-adapter/
│       └── src/
│           ├── events/
│           ├── middleware/
│           └── contracts/
│
├── plugins/
│   │
│   ├── sdlc-core/
│   │   ├── .claude-plugin/
│   │   ├── commands/
│   │   ├── agents/
│   │   ├── skills/
│   │   ├── scripts/
│   │   ├── templates/
│   │   └── references/
│   │
│   ├── sdlc-guard/
│   │   ├── .claude-plugin/
│   │   ├── hooks/
│   │   ├── policies/
│   │   └── tests/
│   │
│   ├── model-router/
│   │   ├── .claude-plugin/
│   │   ├── hooks/
│   │   ├── providers/
│   │   └── tests/
│   │
│   ├── secret-guard/
│   │   ├── .claude-plugin/
│   │   ├── hooks/
│   │   ├── scanners/
│   │   └── tests/
│   │
│   └── run-observer/
│       ├── .claude-plugin/
│       ├── hooks/
│       ├── dashboard/
│       └── tests/
│
├── stack-packs/
│   ├── node-typescript/
│   ├── react-typescript/
│   ├── ruby-rails/
│   ├── python/
│   └── go/
│
├── patterns/
│   ├── architecture/
│   ├── creational/
│   ├── structural/
│   ├── behavioral/
│   ├── resilience/
│   ├── data/
│   └── testing/
│
├── examples/
│   ├── new-application/
│   ├── incremental-feature/
│   └── bug-fix/
│
├── docs/
│   ├── architecture/
│   ├── specifications/
│   ├── decisions/
│   └── contributing/
│
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── LICENSE
└── README.md
```

This gives us three important architectural boundaries.

Core is independent of Claude Code. The workflow contracts, validation logic, project profiles and policy decisions should work without importing `claude-code`.

Plugins adapt the core to Claude Code. They implement event handlers, Skills, commands, Agents and UI.

Stack packs provide technology-specific knowledge. We should not duplicate the full lifecycle workflow for Rails, Node.js and Python.

Claude Code supports plugins that combine commands, agents, skills, hooks and MCP servers. Mods add their own TypeScript hook modules through the plugin structure.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com&sz=32)

GitHub+1

# 4. The actual SDLC we should implement

This is the most important component.

We need one lifecycle engine with multiple entry points, not separate and duplicated workflows.

## Complete SDLC lifecycle

1. Discovery & onboarding

   Repository inspection, business context, existing architecture, environment and constraints.

2. Requirements engineering

   Product brief, functional requirements, non-functional requirements, acceptance criteria and assumptions.

3. System design

   Architecture, domain boundaries, database design, API contracts, integrations, security and ADRs.

4. Implementation planning

   Dependency graph, vertical slices, technical tasks, dependencies and checkpoints.

5. Development

   TDD/BDD, implementation, design-pattern selection, incremental integration and refactoring.

6. Verification

   Unit, integration, contract, E2E, static analysis, security and performance checks as applicable.

7. Independent review

   Correctness, architecture, security, maintainability, performance and regression review.

8. Documentation

   Architecture, API, setup, operational documentation and changelog updates.

9. Release & deployment

   Release checks, approval, versioning, CI/CD, deployment and rollback preparation.

10. Operations & feedback

    Observability, incidents, postmortems and improvements to future development.

However, the lifecycle needs different execution modes.

## Mode A — Build a new application

Example: Build a SaaS application from an initial idea.

```
Idea
 |
 v
Product Brief
 |
 v
PRD
 |
 v
Requirements & Acceptance Criteria
 |
 v
Architecture + ADR
 |
 v
Database + API + Security Design
 |
 v
Implementation Plan
 |
 v
MVP Vertical Slices
 |
 v
TDD Implementation
 |
 v
Integration + E2E
 |
 v
Independent Review
 |
 v
Documentation
 |
 v
Release + Deployment
```

A critical restriction: the system must not attempt to build an entire application in one enormous implementation cycle.

Build a minimum viable product as a collection of complete vertical slices.

For example:

| Slice           | Complete outcome                                 |
| --------------- | ------------------------------------------------ |
| Authentication  | Registration, login, validation, tests           |
| User management | CRUD, authorization, UI, tests                   |
| Billing         | Plans, subscriptions, payment integration, tests |
| Dashboard       | API, frontend, filters, data visualization       |
| Administration  | Roles, permissions, audit trail                  |

Each slice should leave the application in a working state.

## Mode B — Build a complete feature in an existing application

This is arguably the most valuable workflow.

Example:

> Add bulk CSV import with validation, duplicate detection, error reporting and background processing to an existing application.

The workflow must first understand the existing implementation.

```
Existing Repository
        |
        v
Inspect working tree and existing plans
        |
        v
Understand architecture and conventions
        |
        v
Trace existing feature dependencies
        |
        v
Identify affected modules
        |
        v
Feature specification
        |
        v
API / Database / UI design
        |
        v
Acceptance criteria
        |
        v
Vertical implementation plan
        |
        v
TDD: tests first
        |
        v
Implement incrementally
        |
        v
Run all relevant verification
        |
        v
Independent code review
        |
        v
Update documentation
        |
        v
Feature complete
```

Here are the rules I would enforce:

- Inspect existing code before proposing new abstractions.
- Preserve existing public contracts unless a change is required and approved.
- Reuse existing services, components and design conventions.
- Never overwrite an incomplete implementation plan from another task.
- Make database changes backward-compatible where necessary.
- Include regression tests for existing behavior.
- Verify the actual Git diff before completion.
- Don't claim success based on tests that were skipped.

The incremental planning and vertical-slice approach is consistent with the engineering practices in the planning reference we reviewed.

## Mode C — Bug fix and refactoring

Use different safeguards.

Bug fix: reproduce the bug, write a failing regression test, identify root cause, fix, run regression tests and independently review.

Refactoring: characterize existing behavior with tests, make structural changes without changing behavior, and compare verification results.

These modes share the same validation engine, but have different acceptance criteria.

# 5. Commands: keep the public interface small

I would expose six primary commands initially.

| Command        | Responsibility                          |
| -------------- | --------------------------------------- |
| `/kit:init`    | Discover and configure the project      |
| `/kit:app`     | Start a new application lifecycle       |
| `/kit:feature` | Build a complete feature increment      |
| `/kit:fix`     | Diagnose and fix a defect               |
| `/kit:review`  | Independent engineering review          |
| `/kit:release` | Release readiness and release execution |

These are workflow entry points, not individual shell command wrappers.

For example:

`/kit:feature` should invoke the relevant skills in the correct order, generate the required specification and plan, and use scripts for validation.

It should not load every design pattern, security reference, testing guide and agent instruction into context at the beginning.

# 6. Skills and agents

This is where we build the actual AI developer capabilities.

### Skills

I would start with nine focused skills:

| Skill                      | Responsibility                                    |
| -------------------------- | ------------------------------------------------- |
| `repo-discovery`           | Understand existing applications                  |
| `requirements-engineering` | PRDs, specifications and acceptance criteria      |
| `system-design`            | Architecture, ADRs, data models and API contracts |
| `implementation-planning`  | Dependency graph and vertical slices              |
| `tdd-bdd`                  | Test-first development                            |
| `design-pattern-selection` | Select appropriate patterns                       |
| `code-quality`             | Maintainability and refactoring                   |
| `security-engineering`     | Threat modeling and secure implementation         |
| `release-engineering`      | Documentation, release and deployment             |

Skills should contain their supporting `scripts/`, `references/` and `examples/` as needed.

### Agents

Don't create an agent for every discipline.

Start with four:

Repository Analyst

Read-only

Existing code, dependencies, architectural boundaries and impact analysis.

Architecture Reviewer

Design review

Architecture trade-offs, coupling, scalability and pattern appropriateness.

Code Reviewer

Read-only, independent review

Correctness, regressions, testing, code quality and performance.

Security Reviewer

Read-only, security-focused

Attack surfaces, authorization, secrets, dependency risks and unsafe changes.

The primary coding agent should own implementation. Additional agents should be delegated work only when that work is sufficiently independent.

# 7. Design patterns library

This needs special attention. I don't want a kit that automatically introduces Factory, Repository, Strategy, CQRS or DDD into every application.

Patterns should solve demonstrated design problems, not become implementation requirements.

I would organize the knowledge base into seven categories.

| Category     | Patterns and techniques                                                                |
| ------------ | -------------------------------------------------------------------------------------- |
| Architecture | Modular monolith, Hexagonal, Clean Architecture, Vertical Slice, DDD, Event-driven     |
| Creational   | Factory, Abstract Factory, Builder, Prototype, Singleton                               |
| Structural   | Adapter, Decorator, Facade, Composite, Proxy, Bridge                                   |
| Behavioral   | Strategy, Observer, Command, State, Chain of Responsibility, Mediator                  |
| Resilience   | Retry with backoff, Circuit Breaker, Bulkhead, Timeout, Idempotency, Outbox            |
| Data         | Repository, Unit of Work, CQRS, Transaction Script, Data Mapper                        |
| Testing      | Test Pyramid, Contract Testing, Property-based Testing, Mutation Testing, Test Doubles |

### Pattern documentation contract

Every pattern should follow one consistent format.

```
# Strategy Pattern

## Problem
What design problem does it solve?

## When to use
What conditions justify introducing it?

## When NOT to use
What simpler alternatives should be considered?

## Structure
Participants and responsibilities.

## Trade-offs
What additional complexity does it introduce?

## Implementation
Language-independent example.

## Stack implementations
TypeScript
Ruby
Python
Go

## Testing strategy
How do we prove the implementation works?

## Related patterns
Alternative and complementary patterns.

## Anti-patterns
Common misuse.
```

### Example: Pattern selection

Suppose we have three payment providers:

```
Stripe
Razorpay
PayPal
```

An implementation with repeated conditionals everywhere is becoming difficult to maintain.

The agent should recognize that the payment algorithm varies while the calling workflow remains stable.

Strategy could be appropriate:

```
interface PaymentProvider {
  charge(input: ChargeInput): Promise<PaymentResult>;
}

class StripeProvider implements PaymentProvider {
  async charge(input: ChargeInput) {
    // Stripe implementation
  }
}

class RazorpayProvider implements PaymentProvider {
  async charge(input: ChargeInput) {
    // Razorpay implementation
  }
}

class PaymentService {
  constructor(private provider: PaymentProvider) {}

  charge(input: ChargeInput) {
    return this.provider.charge(input);
  }
}
```

But the agent should first check whether the application already has a payment-provider abstraction. Introducing a second abstraction would be architectural regression.

### Pattern selection policy

Every proposed pattern must answer:

1. What specific problem exists?
2. Why is the current design insufficient?
3. What simpler alternative was considered?
4. What complexity will the pattern introduce?
5. How will the implementation be tested?

An ADR is required only when the decision has meaningful architectural consequences, not for every small class-level pattern.

This prevents pattern inflation.

# 8. Executable scripts: turn advice into engineering gates

This is where the kit becomes an actual SDK.

Instructions alone are insufficient. A Skill saying "validate your plan" does not prove the plan is valid.

We need scripts with predictable inputs, outputs and exit codes.

I would create a CLI named `kit`.

### Initial commands

| Script              | Responsibility                                             | Priority |
| ------------------- | ---------------------------------------------------------- | -------- |
| `kit doctor`        | Detect environment, runtime and available tools            | P0       |
| `kit init`          | Create project profile and engineering structure           | P0       |
| `kit inspect`       | Inventory project structure and existing conventions       | P0       |
| `kit validate-spec` | Validate specification structure and acceptance criteria   | P0       |
| `kit validate-plan` | Validate tasks, dependencies and verification requirements | P0       |
| `kit verify`        | Run project-specific quality gates                         | P0       |
| `kit audit`         | Security, dependency and secret checks                     | P1       |
| `kit changed`       | Summarize changed files and affected boundaries            | P1       |
| `kit release-check` | Validate release readiness                                 | P1       |
| `kit scaffold`      | Generate standardized engineering artifacts                | P1       |

### Example: Plan validator

`validate-plan.mts`

It should verify:

- Every task has a unique ID.
- Every task has acceptance criteria.
- Every task identifies its verification procedure.
- Dependencies reference existing tasks.
- No cyclic dependencies.
- All referenced specifications exist.
- Required checkpoints exist.
- Tasks are appropriately sized.

Output:

```
{
  "status": "failed",
  "summary": {
    "tasks": 12,
    "valid": 10,
    "invalid": 2
  },
  "errors": [
    {
      "task": "TASK-008",
      "code": "MISSING_ACCEPTANCE_CRITERIA"
    },
    {
      "task": "TASK-011",
      "code": "INVALID_DEPENDENCY"
    }
  ]
}
```

The `/kit:feature` workflow must not proceed to implementation while mandatory plan validation fails.

### Example: Verification runner

`verify.mts`

```
Project profile
      |
      v
Load verification policy
      |
      v
Type checking
      |
      v
Linting
      |
      v
Unit tests
      |
      v
Integration tests
      |
      v
E2E tests (when applicable)
      |
      v
Security checks
      |
      v
Build
      |
      v
Verification report
```

Not all projects need all stages. The project profile determines which gates apply.

The report must distinguish:

- PASS
- FAIL
- SKIPPED
- BLOCKED

A skipped test must never be reported as passed.

### Important execution rule

Do not execute arbitrary shell strings from model-generated plans or project configuration.

Use validated argument arrays, `shell: false`, bounded execution time and repository-scoped working directories. Scripts must not silently execute database migrations, deploy, publish packages or modify Git history.

# 9. Project profile and persistent engineering state

Every application needs a small project profile.

For example:

`.ai-kit/project.yml`

```
version: 1

project:
  name: example-app
  mode: existing

stack:
  backend:
    language: typescript
    framework: express
  frontend:
    language: typescript
    framework: react
  database:
    primary: postgresql

architecture:
  style: modular-monolith

quality:
  commands:
    typecheck:
      - npm
      - run
      - typecheck

    lint:
      - npm
      - run
      - lint

    unit:
      - npm
      - test

    build:
      - npm
      - run
      - build

policies:
  tdd: required
  approval:
    migrations: required
    deployment: required
    force_push: prohibited
```

This is illustrative. `kit init` should discover candidate values from the actual repository and request approval before saving them.

### Engineering artifacts

I would standardize these paths:

```
docs/
│
├── product/
│   ├── PRD.md
│   └── requirements/
│
├── specifications/
│   ├── features/
│   └── technical/
│
├── architecture/
│   ├── system-design.md
│   └── adr/
│
├── plans/
│   └── feature-plans/
│
├── testing/
│   └── test-strategy.md
│
├── security/
│   └── threat-models/
│
└── releases/
    └── CHANGELOG.md

.ai-kit/
├── project.yml
├── state/
└── reports/
```

Specifications, plans and ADRs should normally be committed. Local runtime state, caches and sensitive reports should have explicit retention and ignore policies.

The kit should always inspect existing incomplete plans before creating or replacing them.

# 10. Our own Claude Code Mods library

Now to the core of the original idea.

Official Claude Code provides several useful interception points:

- `turn.step` allows changing model and effort for individual model requests.
- `agent.spawn` allows choosing the model for subagents.
- `tool.call` intercepts tool execution.
- `tool.check` handles allow, ask and deny permission decisions.
- `prompt.submit` and `prompt.context` handle submitted prompts and context.
- `ui.render` enables custom interface rendering.
- Session and turn events provide lifecycle information.

These are documented interfaces, not unrestricted access to every internal operation.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+2

### Proposed Mod 1 — SDLC Guard

P0

Responsibilities:

- Destructive shell-command governance.
- Database migration approval.
- Git force-push protection.
- Protected file modification.
- Branch protection.
- Release and deployment approval.

Suggested events:

```
tool.call
tool.check
```

Use separate policy modules internally:

```
sdlc-guard/
  policies/
    shell-policy.ts
    git-policy.ts
    migration-policy.ts
    file-policy.ts
    deployment-policy.ts
  hooks/
    register.ts
  tests/
```

Static Git restrictions should preferably use native Git configuration and permissions as well. Runtime Mods provide contextual governance, not a replacement for operating-system security.

### Proposed Mod 2 — Model Router

P0

This is where we implement your four-level routing concept.

Responsibilities:

- Task complexity classification.
- Risk classification.
- Model selection.
- Effort selection.
- Budget constraints.
- Model capability checking.
- Confidence thresholds.
- Fallback and escalation.
- User-selected model preservation.

Events:

```
turn.step
agent.spawn
```

Suggested architecture:

```
model-router/
│
├── classifier/
│   ├── task-classifier.ts
│   └── risk-classifier.ts
│
├── routing/
│   ├── model-selector.ts
│   ├── effort-selector.ts
│   └── routing-policy.ts
│
├── providers/
│   ├── static-policy.ts
│   ├── openai-decisions.ts
│   └── custom-router.ts
│
├── escalation/
│   ├── escalation-policy.ts
│   └── retry-policy.ts
│
├── hooks/
│   └── register.ts
│
└── tests/
```

The router should have a deterministic baseline policy. An external AI classifier can be optional.

One key rule:

Risk and complexity are two different dimensions.

A simple database deletion is low complexity but high consequence.

A complex documentation analysis may be high complexity but low operational risk.

### Routing policy

| Task classification    | Initial model      | Effort | Verification              |
| ---------------------- | ------------------ | ------ | ------------------------- |
| Simple lookup          | Fast               | Low    | Structural                |
| Routine coding         | Balanced           | Medium | Tests                     |
| Architecture           | Reasoning          | High   | Independent review        |
| Security-sensitive     | Strongest suitable | High   | Mandatory security checks |
| Irreversible operation | Policy-controlled  | High   | Approval + verification   |

The router must also preserve model pinning when the developer explicitly requests a particular model, unless a deliberate override policy is configured.

One important distinction: model selection does not itself provide verification-driven escalation. That belongs in our reusable core workflow engine.

### Proposed Mod 3 — Secret Guard

P0

Responsibilities:

- Secret scanning.
- Tool-output redaction.
- File-write checks.
- Git commit/push checks.
- Credential exposure warnings.
- Redaction audit records.

Integrations:

- Gitleaks.
- Native project scanners.
- Custom detection rules.

This should be conservative, tested and explicit about detection coverage.

### Proposed Mod 4 — Run Observer

P1

Responsibilities:

- Active agents.
- Tool execution.
- Model selection.
- Effort level.
- Execution duration.
- Token usage.
- Estimated cost.
- Verification status.
- Retry and escalation history.

Suggested interface:

SDLC Runtime

Illustrative

# 03

Active agents

# 18

Tool operations

# Sonnet

Selected model

# Medium

Effort

Feature execution

1. Repository discovery

   Complete

2. Architecture design

   Complete

3. Implementation

   Running

4. Verification

   Pending

This is an illustrative design, not live execution telemetry.

I would not build this dashboard first. The event data and execution-state contracts must exist before the UI.

### What must not become a Mod

Do not put the following into Mods simply because the API permits interception:

- PRD generation.
- Architecture documentation.
- Design-pattern recommendations.
- Test case generation.
- Feature planning.
- Changelog creation.
- API documentation.
- Release notes.

These belong in Skills, templates and deterministic scripts.

Also, Claude Code Mods run with the host's machine-level privileges and are not an isolated security sandbox. Actual isolation requires operating-system permissions, containers or other suitable execution boundaries.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://claude.com&sz=32)

Claude by Anthropic+1

# 11. Quality gates and Definition of Done

This kit needs a universal engineering quality contract, with project-specific verification commands.

Every feature should pass the following gates.

| Gate           | Required evidence                                                   |
| -------------- | ------------------------------------------------------------------- |
| Requirements   | Acceptance criteria satisfied                                       |
| Architecture   | Approved design decisions, where needed                             |
| Implementation | No unintended scope changes                                         |
| Tests          | Relevant tests pass                                                 |
| Regression     | Existing behavior preserved                                         |
| Static quality | Lint and type checks pass where applicable                          |
| Security       | No unresolved critical/high findings without documented disposition |
| Performance    | Requirements met where performance is relevant                      |
| Documentation  | Relevant docs updated                                               |
| Git            | Diff reviewed; no unintended files                                  |
| Release        | Approval and release checks complete                                |

The system should produce a machine-readable verification report.

```
interface VerificationReport {
  runId: string;
  commitSha: string;
  status: "passed" | "failed" | "blocked";
  checks: Array<{
    id: string;
    status: "passed" | "failed" | "skipped";
    command?: string[];
    durationMs?: number;
    evidence?: string[];
    errors?: string[];
  }>;
}
```

This is more useful than having an agent say:

> Everything looks good. Feature completed.

We need reproducible evidence.

# 12. Distribution and installation

One marketplace, modular installation.

For example:

```
# Add our marketplace
claude plugin marketplace add <owner>/agentic-sdlc-kit

# Install the core
claude plugin install sdlc-core@agentic-sdlc-kit

# Install runtime governance
claude plugin install sdlc-guard@agentic-sdlc-kit

# Install model routing
claude plugin install model-router@agentic-sdlc-kit

# Install security
claude plugin install secret-guard@agentic-sdlc-kit

# Install observability
claude plugin install run-observer@agentic-sdlc-kit
```

The names are proposed conventions, not existing published packages.

The CLI should support:

```
kit install
kit install --profile minimal
kit install --profile full-sdlc
kit install --stack node-typescript

kit doctor
kit update
kit uninstall --dry-run
kit uninstall
```

The installer must have:

- Idempotent installation.
- Symlink protection.
- File-preservation guarantees.
- Explicit overwrite approval.
- Installation manifest.
- Clean uninstall.
- Version compatibility checks.
- Dry-run support.
- Linux, macOS and Windows support.
- No automatic installation of untrusted third-party Mods.

Also, keep the global instructions small. Use Skills and path-scoped rules for on-demand knowledge rather than stuffing everything into `CLAUDE.md`. Anthropic explicitly highlights the context cost of oversized always-loaded instructions.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://claude.com&sz=32)

Claude by Anthropic

# 13. Implementation roadmap

I would develop this in vertical slices rather than attempting to finish every component before testing the architecture.

## Proposed implementation milestones

1. M0 — Architecture and governance specification

   First milestone
   - Repository architecture.
   - Public interfaces.
   - Plugin boundaries.
   - Project profile schema.
   - Security model.
   - Definition of Done.

2. M1 — Core SDK
   - TypeScript monorepo.
   - Core contracts.
   - CLI foundation.
   - Project discovery.
   - `kit doctor` and `kit init`.
   - Script test harness.
3. M2 — Complete feature workflow
   - `/kit:feature`.
   - Repository analysis.
   - Specification generation.
   - Architecture references.
   - Plan generation.
   - Plan/spec validation.
   - TDD implementation.
   - Verification report.
4. M3 — New application workflow
   - Product brief and PRD.
   - System architecture.
   - API and database design.
   - Vertical-slice planning.
   - Complete MVP implementation workflow.
5. M4 — Runtime governance
   - SDLC Guard.
   - Secret Guard.
   - Mod test infrastructure.
   - Protected-operation policies.
6. M5 — Model router
   - Model capability registry.
   - Complexity/risk classification.
   - Model + effort selection.
   - Fallback and escalation.
   - Cost tracking.
7. M6 — Observability
   - Execution trace.
   - Agent lifecycle.
   - Tool events.
   - Verification results.
   - Optional dashboard.
8. M7 — Stack packs and distribution
   - Node/TypeScript.
   - Rails.
   - React.
   - Python and Go.
   - Installer and uninstall.
   - Versioned releases and marketplace.

## 14. How we will know the architecture actually works

Before expanding the library, I want three reference implementations.

Example 1 — Greenfield application

New application

Build a small full-stack application from a product brief through a tested, documented release.

Acceptance: PRD, ADR, plan, working vertical slices, automated tests, verification report and release checklist.

Example 2 — Existing application feature

Incremental development

Extend an existing application with one substantial end-to-end feature.

Acceptance: respects existing architecture, introduces the necessary backend/frontend/data changes, passes regression checks and produces a reviewable diff.

Example 3 — Defect and refactoring

Maintenance

Reproduce a bug, add a regression test, fix it, then separately demonstrate a behavior-preserving refactor.

Acceptance: the regression test catches the original defect and the refactor preserves the characterized behavior.

The core should be accepted only when these workflows work without requiring the entire Mods library or an expensive external AI router.

# 15. What I would explicitly avoid

These are potential sources of unnecessary complexity.

| Avoid                                                   | Better approach                             |
| ------------------------------------------------------- | ------------------------------------------- |
| 30 independent Mods                                     | Four focused runtime Mods                   |
| Agent for every engineering activity                    | Four specialized agents                     |
| One enormous CLAUDE.md                                  | Small index + on-demand Skills              |
| LLM validation for everything                           | Deterministic validators                    |
| LLM classification on every event                       | Rules first, AI fallback                    |
| One workflow per framework                              | Shared lifecycle + stack packs              |
| One implementation plan for an entire large application | Vertical feature slices                     |
| Automatic pattern selection without evidence            | Pattern decision criteria                   |
| Unlimited retries                                       | Bounded, classified escalation              |
| UI dashboards everywhere                                | Optional observability                      |
| Every change requiring an ADR                           | ADRs for meaningful architectural decisions |

Also, don't make the Mod the source of truth for project progress. The committed specification, plan, tests and verification report should be authoritative. Runtime state is supplementary.

# 16. The most important architectural decision

There is one decision I would lock before writing implementation code:

The SDLC engine must remain runtime-independent.

Consider this:

```
                    AGENTIC SDLC CORE
                           |
             +-------------+-------------+
             |             |             |
          Workflow       Policies     Verification
             |             |             |
             +-------------+-------------+
                           |
                   Runtime Adapters
                           |
             +-------------+-------------+
             |             |             |
         Claude Code     Nexum       Other hosts
             |
          Mods API
```

This means:

- Claude Code is our first supported adapter.
- Mods provide runtime-specific interception.
- The core can eventually be reused by Nexum.
- Skills and commands become host-specific presentation/orchestration layers.
- Engineering scripts remain ordinary executable TypeScript.
- Project profiles and verification contracts remain portable.

Given your existing Node Agent Skills work and Nexum development, I would preserve the Node/TypeScript material as a stack-specific knowledge pack rather than making the entire SDLC system Node-only.&#x20;

# 17. Final architecture decisions

Here is the baseline I would lock for this project.

| Decision                | Selection                                         |
| ----------------------- | ------------------------------------------------- |
| Product                 | Agentic SDLC Kit                                  |
| Architecture            | Modular monorepo                                  |
| Core language           | TypeScript                                        |
| First runtime           | Claude Code Mods                                  |
| Core workflows          | Greenfield, feature, bugfix, refactor             |
| Public commands         | Six                                               |
| Initial agents          | Four                                              |
| Initial skills          | Nine                                              |
| Initial Mods            | Four                                              |
| Script execution        | Deterministic CLI                                 |
| Planning methodology    | Dependency-aware vertical slicing                 |
| Development methodology | TDD/BDD                                           |
| Design methodology      | Pattern selection based on actual design pressure |
| Verification            | Evidence-based quality gates                      |
| Distribution            | Modular plugin marketplace                        |
| Portability             | Runtime-independent core                          |

## My recommended first deliverable

Do not begin with Switchboard, Secret Guard or a dashboard.

Begin with M0: the complete Agentic SDLC Kit specification and architecture contract.

It should contain:

1. Product requirements and scope.
2. System architecture and dependency boundaries.
3. Monorepo structure.
4. TypeScript package contracts.
5. Plugin and Mod contracts.
6. SDLC workflow specifications.
7. Design pattern library taxonomy.
8. Script interfaces and exit-code conventions.
9. Security and approval policies.
10. Implementation milestones with acceptance criteria.

Then implement M1 and prove the `feature` workflow end to end before expanding.

The success criterion is simple: a developer should be able to give the kit either a new application idea or a feature request for an existing repository, and receive a controlled engineering process that produces working, tested, reviewed and documented software—not merely plausible AI-generated code.

# Agentic SDLC Kit — Complete Milestone Roadmap

The target should be a complete, modular AI engineering system, not a large collection of unrelated Mods, agents, prompts, and scripts.

The roadmap below covers M0 through M18. It is ordered so that we first establish a reliable engineering workflow, prove it on an existing application, and only then add runtime intelligence, governance, observability, additional technology stacks, and distribution.

The most important architectural decision remains unchanged: the SDLC engine must be runtime-independent. Claude Code is our first runtime adapter, not the owner of the product's workflow logic.

## 1. Milestone overview

## Delivery roadmap

1. M0 — Product and architecture baseline

   Scope, boundaries, contracts, security model, ADRs, acceptance criteria.

   Prerequisite

2. M1 — Core platform foundation

   Monorepo, TypeScript infrastructure, shared contracts, schemas, testing foundation, CLI skeleton.

3. M2 — Repository discovery and project initialization

   Inspect repositories, establish project profiles, detect existing conventions safely.

4. M3 — Requirements engineering

   Product briefs, feature specifications, user stories, acceptance criteria, BDD scenarios.

5. M4 — Architecture and implementation planning

   Architecture analysis, ADRs, dependency mapping, vertical-slice planning and task validation.

6. M5 — TDD implementation engine

   Controlled implementation loop, focused tests, incremental development and refactoring.

7. M6 — Deterministic verification engine

   Execute configured checks, collect evidence, produce machine-readable verification reports.

8. M7 — Complete incremental feature workflow

   Integrate M2–M6 into one working `/kit:feature` workflow.

   First major product release

9. M8 — Greenfield application workflow

   Requirements through architecture, scaffolding, vertical slices and release.

10. M9 — Bug-fix and refactoring workflows

    Reproduction, regression testing, root-cause analysis and behavior-preserving changes.

11. M10 — Runtime governance Mod

    Destructive-operation protection, approval gates, migration and deployment controls.

12. M11 — Secret Guard Mod

    Secret detection, redaction and protection of file writes and Git operations.

13. M12 — Model and effort Router Mod

    Context-aware model routing, effort selection, fallback and escalation.

14. M13 — Run Observer Mod

    Agent, tool, verification, runtime and cost observability.

15. M14 — Technology stack packs

    Node.js/TypeScript, React, Rails, and additional stack-specific engineering knowledge.

16. M15 — CLI installer and plugin distribution

    Installation profiles, updates, ownership tracking, dry-run and safe uninstall.

17. M16 — CI/CD, compatibility and release engineering

    Automated validation, compatibility matrix, packaging and reproducible releases.

18. M17 — Security, reliability and production hardening

    Adversarial testing, failure recovery, performance and operational controls.

19. M18 — Ecosystem integrations and extensibility

    Additional runtime adapters, MCP integrations, external trackers and extension contracts.

## 2. M0 — Product and architecture baseline

M0 is the architectural freeze. It must establish what we are building before implementation begins.

One distinction: the M0 architecture has been discussed in our conversation, but the actual repository specification, ADRs, and signed-off contracts have not yet been created. I would not mark M0 as implementation-complete until those artifacts exist.

### Required M0 artifacts

| Artifact          | Purpose                                                   |
| ----------------- | --------------------------------------------------------- |
| `PRODUCT.md`      | Product vision, target users, use cases and non-goals     |
| `REQUIREMENTS.md` | Functional and non-functional requirements                |
| `ARCHITECTURE.md` | System boundaries and component architecture              |
| `MODULES.md`      | Skills, agents, commands, Mods, scripts and stack packs   |
| `WORKFLOWS.md`    | New application, feature, bug-fix and refactor lifecycles |
| `CONTRACTS.md`    | Core interfaces and data structures                       |
| `SECURITY.md`     | Threat model, trust boundaries and approval rules         |
| `TESTING.md`      | Test strategy and verification policy                     |
| `ROADMAP.md`      | Milestones, dependencies and acceptance gates             |
| ADRs              | Important architectural decisions and trade-offs          |

### Decisions to freeze

| Concern                          | Proposed decision                                      |
| -------------------------------- | ------------------------------------------------------ |
| Primary language                 | TypeScript                                             |
| Package manager                  | pnpm workspaces                                        |
| Architecture                     | Modular monorepo                                       |
| Core                             | Runtime-independent                                    |
| First runtime                    | Claude Code                                            |
| Plugin model                     | Independently installable plugins                      |
| Workflow engine                  | Shared contracts and workflow orchestration            |
| Knowledge                        | Skills, agents, commands and design pattern references |
| Automation                       | Deterministic TypeScript scripts                       |
| Project configuration            | `.ai-kit/project.yml`                                  |
| Persistent engineering artifacts | Markdown and validated structured metadata             |
| Testing                          | Unit, integration, contract and end-to-end             |
| Security                         | Explicit approval and least privilege                  |
| Initial target                   | Existing-project incremental feature development       |

### M0 exit criteria

- Product scope and non-goals are documented.
- Package boundaries are approved.
- Core contracts are defined.
- Runtime adapter boundary is documented.
- Project profile schema is specified.
- Workflow states and transitions are defined.
- Security and approval policies are documented.
- Test and Definition of Done policies are agreed.
- M1 implementation tasks are approved.

Important: Do not start by implementing every planned Mod. M0 must explicitly protect us against that scope explosion.

# 3. M1 — Core platform foundation

Foundation milestone

Objective: Create a working TypeScript monorepo that provides the foundations for every later milestone.

M1 should produce a buildable, testable platform. It should not attempt to implement the complete SDLC workflow yet.

## 3.1 Proposed repository structure

```
agentic-sdlc-kit/
│
├── .github/
│   └── workflows/
│
├── packages/
│   ├── contracts/
│   │   └── src/
│   │       ├── project/
│   │       ├── workflow/
│   │       ├── specification/
│   │       ├── planning/
│   │       ├── verification/
│   │       ├── policy/
│   │       └── index.ts
│   │
│   ├── core/
│   │   └── src/
│   │       ├── discovery/
│   │       ├── workflows/
│   │       ├── project-profile/
│   │       ├── artifacts/
│   │       ├── policy/
│   │       └── verification/
│   │
│   ├── cli/
│   │   └── src/
│   │       ├── commands/
│   │       ├── application/
│   │       ├── output/
│   │       └── index.ts
│   │
│   ├── testing/
│   │   └── src/
│   │       ├── fixtures/
│   │       ├── assertions/
│   │       ├── validators/
│   │       └── helpers/
│   │
│   └── claude-code-adapter/
│       └── src/
│           ├── contracts/
│           ├── events/
│           └── middleware/
│
├── plugins/
├── stack-packs/
├── patterns/
├── examples/
├── docs/
├── scripts/
│
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── eslint.config.js
├── .gitignore
└── README.md
```

The Claude Code adapter exists as an architectural boundary in M1. We do not need to implement all Claude Code Mods yet.

## 3.2 M1 task breakdown

| ID    | Task                             | Deliverable                                         |
| ----- | -------------------------------- | --------------------------------------------------- |
| M1-01 | Initialize monorepo              | pnpm workspace and package structure                |
| M1-02 | Configure TypeScript             | Shared compiler configuration and build conventions |
| M1-03 | Establish contracts package      | Initial shared types and schemas                    |
| M1-04 | Establish core package           | Runtime-independent application boundaries          |
| M1-05 | Establish CLI package            | Executable CLI skeleton                             |
| M1-06 | Establish testing package        | Fixtures and common test utilities                  |
| M1-07 | Add project profile schema       | Versioned project configuration contract            |
| M1-08 | Add error and result conventions | Consistent error handling and output contracts      |
| M1-09 | Add quality gates                | Lint, format, typecheck, tests and build            |
| M1-10 | Add repository documentation     | Contribution and architecture instructions          |
| M1-11 | Add baseline CI                  | Automated checks for pull requests                  |

### Initial shared contracts

The exact types will be frozen in M0, but the core domain should cover:

```
type WorkflowMode =
  | "app"
  | "feature"
  | "fix"
  | "refactor";

type WorkflowStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "completed"
  | "failed";

type CheckStatus =
  | "passed"
  | "failed"
  | "skipped"
  | "blocked";

interface ProjectProfile {
  schemaVersion: number;
  name: string;
  stack: string[];
  commands: {
    test?: string[][];
    lint?: string[][];
    typecheck?: string[][];
    build?: string[][];
  };
}

interface VerificationReport {
  runId: string;
  commitSha?: string;
  status: "passed" | "failed" | "blocked";
  checks: Array<{
    id: string;
    status: CheckStatus;
    command?: string[];
    durationMs?: number;
    evidence?: string[];
    errors?: string[];
  }>;
}
```

These are illustrative starting contracts, not finalized API declarations.

### M1 acceptance criteria

- All workspace packages build successfully.
- Shared contracts can be imported without circular dependencies.
- Core does not depend on Claude Code APIs.
- CLI launches and displays help/version information.
- Project profile validation has tests.
- CI runs tests, lint, typecheck and build.
- A clean checkout can reproduce the successful build.
- No placeholder package is presented as a working feature.

M1 exit: a stable platform foundation that can support feature implementation.

# 4. M2 — Repository discovery and project initialization

Objective: Make the kit understand an existing repository before it starts changing it.

This is a critical capability. An AI coding assistant that does not understand the target repository's conventions will introduce unnecessary architectural inconsistencies.

### Features

Repository discovery

Identify:

- Languages, frameworks and package managers.
- Directory structure and application entry points.
- Existing architectural boundaries.
- Database and migration systems.
- API and frontend structure.
- Existing test frameworks and test commands.
- CI/CD configuration.
- Existing agent instruction files.
- Git state, branch and uncommitted changes.

Project profile

Generate:

```
.ai-kit/
├── project.yml
├── state/
└── reports/
```

Initialization command

```
kit init
```

Inspection command

```
kit inspect
```

Health command

```
kit doctor
```

### Tasks

| ID    | Task                      | Acceptance criteria                                   |
| ----- | ------------------------- | ----------------------------------------------------- |
| M2-01 | Repository scanner        | Detect supported project structures                   |
| M2-02 | Stack detection           | Identify frameworks and tooling                       |
| M2-03 | Convention discovery      | Capture existing naming and directory patterns        |
| M2-04 | Git-state discovery       | Report branch, dirty files and current commit         |
| M2-05 | Project profile generator | Generate proposed configuration                       |
| M2-06 | Profile validator         | Reject malformed or unsupported profiles              |
| M2-07 | `kit init`                | Require approval before writing project configuration |
| M2-08 | `kit inspect`             | Produce a read-only repository report                 |
| M2-09 | `kit doctor`              | Check toolchain and configuration health              |

### Critical constraints

- Repository inspection must be read-only.
- Do not execute detected scripts simply to determine what they do.
- Do not read or copy secret contents into reports.
- Preserve existing `CLAUDE.md`, `AGENTS.md` and other project instructions.
- Do not silently overwrite configuration.

M2 exit: the kit can inspect and initialize an existing Node.js or Rails repository without modifying application source code.

# 5. M3 — Requirements engineering

Objective: Transform an ambiguous request into a structured, testable engineering specification.

This milestone introduces the first complete set of SDLC Skills.

### Skills

1. `requirements-engineering`
2. `repo-discovery`
3. `tdd-bdd`

### Commands

```
/kit:spec
/kit:requirements
```

### Specification structure

```
docs/
└── specifications/
    └── features/
        └── FEATURE-001/
            ├── SPEC.md
            ├── ACCEPTANCE.md
            ├── SCENARIOS.md
            └── NOTES.md
```

### Specification contents

| Section                     | Required content                    |
| --------------------------- | ----------------------------------- |
| Overview                    | Feature purpose                     |
| Problem                     | Current problem and business impact |
| Scope                       | In-scope and out-of-scope behavior  |
| Actors                      | Users and system actors             |
| Functional requirements     | Expected system behavior            |
| Non-functional requirements | Security, performance, reliability  |
| Acceptance criteria         | Measurable outcomes                 |
| Edge cases                  | Failure and boundary conditions     |
| Dependencies                | Related systems and features        |
| Risks                       | Technical and operational risks     |
| Open questions              | Unresolved decisions                |

### BDD scenario format

```
Feature: User authentication

  Scenario: Successful login
    Given an existing registered user
    When the user submits valid credentials
    Then an authenticated session should be created

  Scenario: Invalid credentials
    Given an existing registered user
    When the user submits invalid credentials
    Then authentication should be rejected
```

### Validation scripts

```
kit validate-spec
```

Validation must check:

- Required sections.
- Unique requirement and acceptance IDs.
- Ambiguous or missing acceptance criteria.
- Traceability from requirements to scenarios.
- Unresolved high-risk questions.
- Explicit scope boundaries.

M3 exit: a feature specification can be generated, reviewed, validated and stored before implementation begins.

# 6. M4 — Architecture and implementation planning

Objective: Convert validated requirements into an architecture-aware implementation plan.

### Skills

- `system-design`
- `implementation-planning`
- `design-pattern-selection`

### Agents

- Repository Analyst
- Architecture Reviewer

### Architecture analysis

The system should analyze relevant architecture before proposing changes:

- Module boundaries.
- Existing service and controller responsibilities.
- Data relationships.
- API contracts.
- External integrations.
- Security boundaries.
- Transaction and concurrency risks.
- Existing design patterns.
- Potential regression areas.

### Architecture artifacts

```
docs/
├── architecture/
│   ├── overview.md
│   ├── component-map.md
│   └── adr/
│       ├── ADR-0001.md
│       └── ADR-0002.md
└── plans/
    └── FEATURE-001/
        ├── PLAN.md
        ├── TASKS.md
        └── DEPENDENCIES.md
```

### Planning requirements

Every task needs:

- Task identifier.
- Explicit description.
- Acceptance criteria.
- Verification procedure.
- Dependencies.
- Likely files or modules involved.
- Estimated scope.
- Risk classification.

Use vertical slices instead of implementing the database, backend and frontend as isolated horizontal projects.

### Design pattern selection

The system should recommend a pattern only where it addresses a real problem.

Example:

| Problem                             | Candidate pattern  |
| ----------------------------------- | ------------------ |
| Multiple interchangeable algorithms | Strategy           |
| Object creation is complex          | Factory or Builder |
| Integrating an external provider    | Adapter            |
| Cross-cutting behavior              | Decorator          |
| Coordinating domain events          | Observer           |
| Complex state transitions           | State              |
| External service instability        | Circuit Breaker    |
| Duplicate request handling          | Idempotency        |

Every recommendation must explain why it applies, when it should not be used and the simpler alternative.

### Planning validator

```
kit validate-plan
```

Check:

- Missing task dependencies.
- Circular dependencies.
- Invalid task IDs.
- Missing acceptance criteria.
- Missing verification steps.
- Tasks that are too large.
- Tasks without links to requirements.
- Missing integration or regression coverage.

M4 exit: the kit can produce an architecture-aware, validated implementation plan with a dependency graph.

# 7. M5 — TDD implementation engine

Objective: Implement the feature through small, controlled, testable increments.

This is where the kit becomes an actual AI development system rather than a requirements-generation tool.

### Implementation lifecycle

1\. Select next task

Choose a task whose dependencies are satisfied.

2\. Understand existing code

Read relevant files, follow conventions and identify existing tests.

3\. Write a failing test

Add a regression or behavior test for the expected result.

4\. Implement minimum change

Implement only what is needed for the selected task.

5\. Verify and refactor

Run focused tests, improve design and maintain behavior.

6\. Record task evidence

Update task status, test evidence, affected files and next dependency.

### Required behavior

- Do not implement multiple unrelated tasks in one uncontrolled operation.
- Preserve existing architecture unless a deliberate change is approved.
- Do not change tests merely to make an implementation pass.
- Add regression coverage for bug fixes.
- Refactor only after behavior is protected by tests.
- Stop when a task is blocked rather than inventing a workaround.

### Implementation Skills

- `tdd-bdd`
- `code-quality`
- `design-pattern-selection`

### M5 exit

A task can be implemented through a repeatable TDD loop, with progress and evidence preserved between sessions.

# 8. M6 — Deterministic verification engine

Objective: Make verification evidence-based, reproducible and independent of the AI model's opinion.

### Verification categories

| Category        | Examples                         |
| --------------- | -------------------------------- |
| Unit            | RSpec, Vitest, Jest              |
| Integration     | API/database integration         |
| Contract        | API schema and service contracts |
| E2E             | Playwright, Cypress              |
| Static analysis | ESLint, RuboCop                  |
| Type checking   | TypeScript                       |
| Security        | Dependency and secret scans      |
| Performance     | Benchmarks and load tests        |
| Build           | Production build and packaging   |

### Commands

```
kit verify
kit verify --task TASK-001
kit verify --changed
kit verify --report
```

### Execution model

Project profile commands must be structured as argument arrays, not arbitrary shell strings.

Example:

```
commands:
  test:
    - ["pnpm", "test"]
  typecheck:
    - ["pnpm", "typecheck"]
  lint:
    - ["pnpm", "lint"]
  build:
    - ["pnpm", "build"]
```

The executor should use process execution with `shell: false`, a repository-scoped working directory, validated arguments and bounded timeouts.

Generated plans must never become trusted shell scripts.

### Verification result

```
{
  "runId": "verify-001",
  "status": "failed",
  "checks": [
    {
      "id": "unit-tests",
      "status": "passed"
    },
    {
      "id": "typecheck",
      "status": "passed"
    },
    {
      "id": "integration-tests",
      "status": "failed"
    },
    {
      "id": "security-scan",
      "status": "skipped"
    }
  ]
}
```

The important distinction:

- `passed` means execution succeeded.
- `failed` means execution found a failure.
- `skipped` means the check was not performed.
- `blocked` means the check could not safely proceed.

Skipped checks must never be counted as passed.

M6 exit: the kit can execute configured quality checks and produce a verifiable report with command, result, duration and evidence.

# 9. M7 — Complete incremental feature workflow

First end-to-end product milestone

Objective: Integrate M2 through M6 into a single usable workflow.

### Public command

```
/kit:feature
```

### End-to-end experience

A developer provides:

> Add role-based access control to the existing application.

The kit should:

1. Inspect the repository.
2. Identify existing authentication and authorization code.
3. Locate affected modules and dependencies.
4. Identify missing requirements.
5. Generate the feature specification.
6. Create acceptance and BDD scenarios.
7. Assess architecture and data model impact.
8. Recommend patterns only where necessary.
9. Produce a dependency-aware implementation plan.
10. Execute tasks incrementally using TDD.
11. Run focused and regression verification.
12. Perform independent code review.
13. Update documentation.
14. Generate a completion report.

### Required artifacts

```
.ai-kit/
docs/
├── specifications/features/
├── architecture/adr/
├── plans/
├── testing/
└── releases/
```

### M7 acceptance test

Use an actual existing application fixture, not only a clean toy repository.

The fixture should contain:

- Existing business logic.
- A database.
- Backend APIs.
- Frontend components.
- Existing tests.
- Existing coding conventions.
- At least one area with meaningful regression risk.

The kit must successfully complete a feature from specification to verified implementation without losing the original repository state.

This should be the first milestone considered a genuine product release.

# 10. M8 — Greenfield application workflow

Objective: Build a new application from an initial product idea.

### Command

```
/kit:app
```

### Workflow

| Stage             | Output                                  |
| ----------------- | --------------------------------------- |
| Product discovery | Product brief                           |
| Requirements      | PRD and functional requirements         |
| System design     | Architecture and ADRs                   |
| Data design       | ERD and database model                  |
| API design        | OpenAPI or equivalent contracts         |
| Security design   | Threat model and access controls        |
| Planning          | MVP and vertical-slice roadmap          |
| Foundation        | Repository and application scaffold     |
| Implementation    | Incremental working features            |
| Verification      | Tests and quality report                |
| Review            | Independent assessment                  |
| Release           | Versioned release and operational notes |

### Critical design choice

Do not ask the AI to generate an entire production application in a single pass.

Instead:

1. Establish the application foundation.
2. Implement the first end-to-end vertical slice.
3. Verify and review it.
4. Implement the next slice.
5. Repeat until the planned release scope is satisfied.

### M8 acceptance criteria

- Application requirements are traceable to implementation tasks.
- Architecture and API contracts are persisted.
- The application can be built and tested from a clean checkout.
- Each completed vertical slice has test evidence.
- Final release checks are performed against the project profile.

# 11. M9 — Bug-fix and refactoring workflows

Objective: Support maintenance work without treating every change like a new feature.

### Commands

```
/kit:fix
/kit:refactor
```

### Bug-fix workflow

1. Capture expected and actual behavior.
2. Reproduce the bug.
3. Identify the root cause.
4. Add a regression test.
5. Implement the smallest valid correction.
6. Run focused tests.
7. Run regression checks.
8. Review the diff.
9. Document the result.

### Refactoring workflow

1. Identify the current behavior.
2. Discover callers and dependencies.
3. Establish characterization tests where required.
4. Define the intended structural change.
5. Preserve observable behavior.
6. Refactor in small increments.
7. Run regression tests.
8. Compare the before/after structure and quality.

### Acceptance criteria

The system must distinguish between:

- Behavior change.
- Structural refactoring.
- Bug correction.
- Performance optimization.

It must not silently combine all four into one task.

# 12. M10 — Runtime governance Mod

Objective: Introduce deterministic operational safeguards into the agent runtime.

Proposed plugin:

```
plugins/
└── sdlc-guard/
    ├── .claude-plugin/
    ├── hooks/
    ├── policies/
    ├── tests/
    └── README.md
```

### Protect

| Action                       | Expected policy                                     |
| ---------------------------- | --------------------------------------------------- |
| File deletion                | Inspect scope and require approval when destructive |
| Bulk modification            | Assess impact before execution                      |
| Database migration           | Apply configured approval policy                    |
| Production database mutation | Require explicit authorization                      |
| Git force push               | Require approval                                    |
| Release/deploy               | Require release gate                                |
| Secret/config modification   | Apply sensitive-file policy                         |
| Dependency removal           | Review impact                                       |

### Design

Separate policy evaluation from host-specific event handling.

A pure function should evaluate an action against the policy. The Claude Code adapter should translate that result into the appropriate host decision.

### Non-negotiable limitation

Claude Code Mods execute with the host process's access to the machine. They are not an operating-system sandbox. The Mod can provide approval controls, but real isolation must come from OS permissions, containers, restricted credentials and deployment controls.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://claude.com&sz=32)

Claude by Anthropic

### M10 exit

- Policy decisions have deterministic unit tests.
- Destructive cases are covered by integration tests.
- Non-interactive behavior is explicitly defined.
- Fail-open/fail-closed behavior is documented per action.
- A bypass cannot silently turn a denied action into an approval.

# 13. M11 — Secret Guard Mod

Objective: Reduce the risk of secret leakage across reads, writes, tool outputs and Git operations.

### Capabilities

1. Detect known secret patterns.
2. Redact detected values from tool output.
3. Inspect file writes and edits.
4. Scan staged changes.
5. Scan commits and pushes.
6. Integrate with Gitleaks where installed.
7. Maintain an explicit ignore policy.
8. Produce findings without printing secret values.

### Security requirements

- Do not log full secret values.
- Distinguish detection from redaction.
- Avoid false assurance when scanning fails.
- Test partial, encoded and multiline secrets.
- Test oversized files and unreadable diffs.
- Verify exact secret coverage before allowing residual output.
- Make scanner failure behavior configurable and visible.

### M11 exit

An adversarial test suite should prove that representative credentials are detected and redacted in every supported path, and that scan failures cannot be misreported as clean results.

# 14. M12 — Model and effort Router Mod

Objective: Select an appropriate model and reasoning effort for each task without unnecessary inference cost.

### Decision inputs

- Task type.
- Task complexity.
- Risk level.
- Expected reasoning depth.
- Repository size and context needs.
- Required tool capabilities.
- Explicit user model selection.

### Important distinction

Complexity and risk are separate dimensions.

For example:

| Task                               | Complexity | Risk   |
| ---------------------------------- | ---------- | ------ |
| Rename a small component           | Low        | Low    |
| Delete production records          | Low        | High   |
| Design an authorization system     | High       | High   |
| Analyze a complex dependency graph | High       | Medium |

The router must not equate a simple task with a safe task.

### Routing policy

- Preserve explicit user model selections.
- Route main-turn requests and subagent requests separately.
- Route model and effort independently.
- Support deterministic fallback.
- Escalate when verification or analysis indicates inadequate results.
- Begin in suggest-only mode.
- Keep external model classifiers optional.

The Claude Code adapter can use the relevant turn and agent lifecycle events. Current Mod APIs distinguish main model-request events from agent spawning, but the installed Claude Code version's declarations must be the final authority.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://code.claude.com&sz=32)

Claude Code Docs+1

### M12 exit

A routing test suite demonstrates correct model/effort selection, explicit-choice preservation, fallback, risk-aware handling and deterministic behavior without requiring a network classifier for ordinary decisions.

# 15. M13 — Run Observer Mod

Objective: Make agent execution and verification observable.

### Collect

- Session and workflow lifecycle.
- Agent spawn and completion.
- Tool calls and outcomes.
- Model and effort selection.
- Execution duration.
- Token usage where exposed.
- Verification results.
- Escalations and retries.
- Failures and blocked actions.
- Estimated cost where reliable data exists.

### Proposed output

```
.ai-kit/
└── reports/
    └── runs/
        └── RUN-001/
            ├── summary.json
            ├── events.jsonl
            ├── verification.json
            └── review.md
```

### Initial interface

Start with a CLI report rather than a dashboard:

```
kit runs
kit runs show RUN-001
kit runs report RUN-001
```

A dashboard is a later interface, not a prerequisite for observability.

### M13 acceptance criteria

- Run events have stable identifiers and schemas.
- Event collection does not materially block tool execution.
- Sensitive values are redacted.
- Local retention and cleanup are defined.
- Partial or missing telemetry is represented honestly.

Claude Code hook execution has time limits and API constraints. Long test suites and expensive analyses must run through explicit scripts, not lifecycle hooks.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://claude.com&sz=32)

Claude by Anthropic

# 16. M14 — Technology stack packs

Objective: Add stack-specific engineering knowledge without contaminating the core.

```
stack-packs/
├── node-typescript/
├── react-typescript/
├── ruby-rails/
├── python/
└── go/
```

Each stack pack should contain:

```
stack-pack/
├── manifest.json
├── skills/
├── references/
├── templates/
├── scripts/
├── policies/
└── tests/
```

### Initial priorities

| Pack               | Main contents                                                        |
| ------------------ | -------------------------------------------------------------------- |
| Node.js/TypeScript | Express, APIs, modules, async patterns, validation and testing       |
| React/TypeScript   | Components, hooks, state, forms, accessibility and frontend testing  |
| Ruby on Rails      | MVC, services, Active Record, jobs, API design, RSpec and migrations |
| Python             | Application architecture, type safety, testing and packaging         |
| Go                 | Modules, interfaces, concurrency, error handling and testing         |

### Quality requirements

- Follow repository conventions instead of imposing generic structure.
- Keep stack-specific instructions isolated.
- Do not duplicate core lifecycle logic.
- Validate examples against real fixture projects.
- Avoid forcing patterns where simpler existing solutions are sufficient.

### Additional pattern library

The `patterns/` catalog should cover:

- Architecture.
- Creational patterns.
- Structural patterns.
- Behavioral patterns.
- Resilience patterns.
- Data patterns.
- Testing patterns.

Patterns should be documented once as language-independent concepts, then linked to implementation examples in stack packs.

# 17. M15 — CLI installer and plugin distribution

Objective: Provide a reliable installation and lifecycle experience.

### Installation profiles

| Profile        | Contents                                                    |
| -------------- | ----------------------------------------------------------- |
| Minimal        | Core instructions, commands and essential Skills            |
| Full SDLC      | All core workflows, agents, scripts and templates           |
| Runtime        | Optional governance, security, routing and observation Mods |
| Stack-specific | Selected technology packs                                   |

### Expected commands

```
kit install
kit install --profile minimal
kit install --profile full-sdlc
kit install --stack node-typescript

kit update
kit doctor

kit uninstall --dry-run
kit uninstall
```

### Installer requirements

- Idempotent installation.
- Project and user installation scopes.
- Explicit overwrite confirmation.
- Dry-run support.
- Ownership manifest.
- Symlink protection.
- File backup or preservation policy.
- Version and compatibility checks.
- Safe uninstall of only kit-owned files.
- No silent modification of user configuration.

This is an important improvement over simplistic installers that only add files but do not track ownership or support safe removal.

### M15 exit

Repeated installation does not duplicate files, upgrades preserve user-owned content, and uninstall removes only files owned by the kit.

# 18. M16 — CI/CD, compatibility and release engineering

Objective: Make the platform safe to develop and distribute continuously.

### CI checks

1. Workspace installation.
2. Formatting.
3. Lint.
4. Typecheck.
5. Unit tests.
6. Integration tests.
7. Contract tests.
8. Plugin validation.
9. CLI integration tests.
10. Security scanning.
11. Build and packaging.

### Compatibility matrix

Test against the supported versions of:

- Node.js.
- pnpm.
- TypeScript.
- Claude Code.
- Plugin API and generated types.

Do not claim broad compatibility based on one successful local run.

### Release workflow

```
Change
  → Tests
  → Security scan
  → Compatibility validation
  → Package validation
  → Versioning
  → Release notes
  → Publish
  → Post-release smoke test
```

### M16 exit

Every release has an immutable version, verified package artifacts, release notes and a reproducible validation record.

# 19. M17 — Security, reliability and production hardening

Objective: Verify that the kit remains safe and reliable under failure, adversarial input and real-world repository complexity.

### Test domains

| Domain          | What to test                                                |
| --------------- | ----------------------------------------------------------- |
| Installer       | Interrupted installation, rollback and uninstall            |
| Discovery       | Malformed manifests, large repositories and unusual layouts |
| Workflow engine | Interrupted workflows and resumed sessions                  |
| Planning        | Cycles, missing dependencies and invalid tasks              |
| Executor        | Timeouts, signals, path escapes and malicious arguments     |
| Secret Guard    | Encoded secrets, partial matches and redaction gaps         |
| Runtime Guard   | Bypass attempts and non-interactive execution               |
| Router          | Incorrect classifications and unavailable providers         |
| Observer        | Missing events, large logs and retention                    |
| Stack packs     | Compatibility against real repositories                     |

### Reliability requirements

- Bounded retries.
- Explicit timeouts.
- Failure recovery.
- Idempotent operations where possible.
- Structured logs.
- Versioned persistent state.
- Safe handling of interrupted workflows.
- No false-positive verification success.

### M17 exit

The kit passes its security and reliability test suite, and critical failure cases have deterministic, documented behavior.

# 20. M18 — Ecosystem integrations and extensibility

Objective: Expand the kit without tying it to a single host or external service.

Possible additions:

### Runtime adapters

- Claude Code.
- Codex.
- Other compatible agent runtimes after validating their APIs and capabilities.

### Integrations

- GitHub Issues and Pull Requests.
- Jira or Linear.
- CI providers.
- MCP servers.
- Documentation systems.
- Project knowledge systems.

### Extension API

External contributors should be able to provide:

- Stack packs.
- Skills.
- Agents.
- Commands.
- Validators.
- Policy packs.
- Runtime adapters.

Every extension should declare:

- Schema version.
- Compatibility range.
- Required capabilities.
- Dependencies.
- Trust level.
- Installation behavior.
- Tests and validation requirements.

M18 exit: extensions can be added without requiring changes to the core workflow engine.

# 21. Cross-milestone engineering standards

These rules apply to every milestone. They are more important than the number of features we ship.

## A. Every task must be independently verifiable

A task cannot be accepted merely because its implementation appears complete.

Each task needs:

- Acceptance criteria.
- Focused tests.
- Verification commands.
- Dependency information.
- Files or components affected.
- A clear completion status.

Break tasks down until they can be completed in a focused implementation session. Keep checkpoints after every few tasks, not only at the end of a milestone.

## B. Define a shared Definition of Done

| Dimension      | Completion requirement                      |
| -------------- | ------------------------------------------- |
| Requirements   | Acceptance criteria satisfied               |
| Architecture   | Consistent with approved boundaries         |
| Implementation | No unrelated changes                        |
| Tests          | Required tests executed successfully        |
| Regression     | Relevant existing behavior verified         |
| Quality        | Lint and typecheck pass where configured    |
| Security       | Relevant security checks completed          |
| Documentation  | Updated where behavior or contracts changed |
| Review         | Independent review completed                |
| Evidence       | Verification report persisted               |

## C. Keep agent context small

Do not create a 1,000-line root instruction file.

Use:

- A short root instruction file for universal rules.
- On-demand Skills for procedures.
- Path-scoped rules for specific components.
- Agents for independent analysis.
- Scripts for deterministic checks.

The official Claude Code guidance favors concise root instructions and on-demand Skills rather than loading every procedure into the initial context.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://claude.com&sz=32)

Claude by Anthropic

## D. Separate deterministic and AI-driven work

| Activity                    | Preferred mechanism                            |
| --------------------------- | ---------------------------------------------- |
| Requirements analysis       | AI-assisted workflow                           |
| Architecture recommendation | AI-assisted workflow                           |
| Task planning               | AI plus deterministic validator                |
| Secret scanning             | Deterministic scanner                          |
| Destructive-action approval | Policy engine and host controls                |
| Unit tests                  | Test runner                                    |
| Type checking               | TypeScript compiler                            |
| Lint                        | Linter                                         |
| Verification reporting      | Deterministic engine                           |
| Code review                 | Independent AI review plus static checks       |
| Model routing               | Deterministic rules first, optional classifier |

Do not use an LLM to validate facts that a deterministic program can verify more reliably.

# 22. Dependency and parallel execution strategy

Not every milestone should be implemented serially. Once the core contracts are stable, independent work can proceed in parallel.

## Dependency map

M0 — Architecture baseline

M1 — Core platform

M2 — Repository discovery

M3 — Requirements

M4 — Architecture and planning

M5 — TDD implementation

M6 — Verification

M7 — Incremental feature workflow

After M7, these streams can be developed in parallel where their shared contracts are stable:

M8–M9

Application, fix and refactor workflows

M10–M11

Governance and secret protection

M12–M13

Routing and observability

M14

Stack packs and patterns

M15–M17 — Distribution, CI/CD and hardening

M18 — Ecosystem extensibility

Some dependencies remain strict:

- M10–M13 require the Claude Code adapter contracts from M1.
- M12 and M13 require stable event and execution contracts.
- M15 depends on the CLI and plugin packaging conventions.
- M16 must validate all supported package types and versions.
- M17 must test the actual combined product, not isolated modules only.

# 23. Test fixtures required across the roadmap

We should not validate this kit against only one toy application.

Build and maintain three reference fixtures:

| Fixture                  | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `fixture-node-fullstack` | Existing Node.js + React + TypeScript application with database and tests |
| `fixture-rails-api`      | Existing Rails API with models, services, migrations and RSpec            |
| `fixture-greenfield`     | Empty or minimal repository for new application creation                  |

Use them across milestones.

| Fixture         | Critical workflows                                             |
| --------------- | -------------------------------------------------------------- |
| Node full stack | Feature, bug fix, refactor, review, verification               |
| Rails API       | Feature, migration approval, TDD, regression                   |
| Greenfield      | Requirements, architecture, scaffold, vertical slices, release |

We should also deliberately inject failures:

- Failing tests.
- Dirty Git state.
- Invalid project configuration.
- Missing dependencies.
- Secret-containing files.
- Destructive commands.
- Interrupted runs.
- Circular task dependencies.

This makes the fixtures genuine acceptance environments rather than showcase examples.

# 24. Release gates — what should count as a usable product?

We should not wait until M18 to obtain value. Each release should deliver something useful.

| Release                             | Includes | What users can accomplish                      |
| ----------------------------------- | -------- | ---------------------------------------------- |
| 0.1 — Foundation                    | M0–M1    | Installable development foundation             |
| 0.2 — Repository awareness          | M2       | Safely inspect and initialize projects         |
| 0.3 — Engineering planning          | M3–M4    | Generate validated specifications and plans    |
| 0.4 — Implementation core           | M5–M6    | Execute tasks and verify changes               |
| 0.5 — Feature workflow              | M7       | Develop a complete existing-project feature    |
| 0.6 — App and maintenance workflows | M8–M9    | Build apps, fix bugs and refactor              |
| 0.7 — Security governance           | M10–M11  | Protect sensitive and destructive operations   |
| 0.8 — Runtime intelligence          | M12–M13  | Route and observe execution                    |
| 0.9 — Stack ecosystem               | M14      | Use stack-specific engineering packs           |
| 1.0 — Production distribution       | M15–M17  | Install, update, verify and maintain the kit   |
| 1.x — Ecosystem                     | M18      | Extend to additional runtimes and integrations |

The release numbers are proposed planning labels, not existing published versions.

# 25. The recommended implementation order

The temptation will be to start with the visible Mods—model routing, dashboards, secret detection and fancy agent orchestration. Resist that.

The highest-value sequence is:

1. M0: Freeze architecture, contracts, security and product scope.
2. M1: Establish a clean, buildable TypeScript monorepo.
3. M2: Make repository discovery reliable.
4. M3–M4: Generate validated requirements and plans.
5. M5–M6: Implement controlled development and verification.
6. M7: Prove the complete feature-development workflow against real repositories.
7. M8–M9: Add greenfield, bug-fix and refactoring workflows.
8. M10–M11: Add safety and security Mods.
9. M12–M13: Add routing and observability.
10. M14–M17: Expand stacks, distribution, CI and hardening.
11. M18: Expand the ecosystem.

## My strongest recommendation

M7 should be our first major success criterion, not M12 or M13.

A kit that can take a real existing Rails or Node.js repository, understand its architecture, produce a valid feature specification, plan vertical slices, write tests, implement changes, verify regressions and produce a trustworthy report is already useful.

A sophisticated router or dashboard without that capability is just infrastructure around an incomplete product.

The first concrete implementation package should therefore be:

- M0 artifact freeze.
- M1 tasks M1-01 through M1-11.
- A clean CI baseline.
- A reference fixture for the first M2/M7 integration path.

No implementation or repository changes have been made as part of this planning response.&#x20;

# Agentic SDLC Kit — Post-M7 Implementation Roadmap

Planning assumption: M0–M7 have been completed, reviewed and accepted. We are now planning the complete M8 onward roadmap.

M7 gives us the first working product: the ability to develop and verify a feature in an existing application. M8 expands that capability to new applications. M9 adds maintenance workflows. M10 onward strengthens runtime safety, intelligence, observability, stack support, distribution and extensibility.

I recommend planning through M20, with M8 and M9 receiving the most detailed breakdown because they extend the actual engineering workflows.

## 1. Post-M7 roadmap

| Milestone | Objective                           | Main deliverable                        |
| --------- | ----------------------------------- | --------------------------------------- |
| M8        | Greenfield application development  | Complete `/kit:app` workflow            |
| M9        | Bug fixing and refactoring          | `/kit:fix` and `/kit:refactor`          |
| M10       | Runtime governance                  | `sdlc-guard` Mod                        |
| M11       | Secret protection                   | `secret-guard` Mod                      |
| M12       | Model and effort routing            | `model-router` Mod                      |
| M13       | Execution observability             | `run-observer` Mod                      |
| M14       | Technology and design pattern packs | Reusable stack ecosystem                |
| M15       | Installer and package management    | Reliable install/update/uninstall       |
| M16       | CI/CD and release management        | Reproducible releases                   |
| M17       | Security and reliability hardening  | Production-quality platform             |
| M18       | Runtime and external integrations   | Extensible integration framework        |
| M19       | Evaluation and benchmarking         | Measurable agent/workflow quality       |
| M20       | Team and organization governance    | Shared policies and controlled adoption |

Target

&#x20;M17 should represent the production-ready 1.0 product. M18–M20 extend it into a broader ecosystem and team-oriented platform.

# 2. M8 — Greenfield application development

Highest priority

## Objective

Enable a developer to describe a new application idea and have the kit take it through the complete SDLC:

Product discovery → Requirements → Architecture → Planning → Scaffolding → Incremental implementation → Verification → Review → Release.

The most important design decision is to reuse the existing M3–M6 workflow engine instead of building a separate greenfield implementation engine.

We should have one implementation engine with different workflow entry points.

### 2.1 User experience

Command:

```
/kit:app
```

Example user request:

> Build a subscription-based project management application with user authentication, organizations, projects, task management, billing and role-based access control.

Expected behavior:

1. Understand the product idea.
2. Identify missing business requirements.
3. Produce a product brief.
4. Generate a PRD and acceptance criteria.
5. Propose an architecture.
6. Define application modules and boundaries.
7. Design database entities and relationships.
8. Define API contracts.
9. Create security and operational requirements.
10. Break the MVP into vertical slices.
11. Generate the initial project structure.
12. Implement the foundation.
13. Implement features incrementally.
14. Verify and review each slice.
15. Produce release documentation and evidence.

It must not generate the entire application in one uncontrolled implementation operation.

## 2.2 M8 architecture

```
/kit:app
    |
    v
Application Workflow
    |
    +--> Product Discovery
    |
    +--> Requirements Engine (M3)
    |
    +--> Architecture Engine (M4)
    |
    +--> Planning Engine (M4)
    |
    +--> Project Scaffolding
    |
    +--> Implementation Engine (M5)
    |
    +--> Verification Engine (M6)
    |
    +--> Review
    |
    +--> Release Preparation
```

Suggested core boundaries:

```
packages/
└── core/
    └── src/
        └── workflows/
            └── application/
                ├── application.workflow.ts
                ├── application.state.ts
                ├── application.context.ts
                ├── application.transitions.ts
                ├── application.validators.ts
                └── stages/
                    ├── discovery.ts
                    ├── requirements.ts
                    ├── architecture.ts
                    ├── planning.ts
                    ├── scaffolding.ts
                    ├── implementation.ts
                    ├── verification.ts
                    └── release.ts
```

The workflow orchestration belongs in `core`. Claude Code Skills and commands should initiate and guide the workflow rather than own its business logic.

## 2.3 M8 detailed task breakdown

### Phase A — Application workflow contracts

| ID    | Task                                        | Deliverable                         |
| ----- | ------------------------------------------- | ----------------------------------- |
| M8-01 | Define application workflow contract        | Typed workflow input/output         |
| M8-02 | Define application lifecycle                | State machine and valid transitions |
| M8-03 | Define workflow persistence                 | Resume and recovery contract        |
| M8-04 | Integrate existing requirements engine      | Reuse M3 contracts                  |
| M8-05 | Integrate architecture and planning engines | Reuse M4 contracts                  |

The workflow must support:

- New application.
- Existing partially initialized application.
- Resume an interrupted workflow.
- Revisit an approved design decision.
- Block on unresolved critical decisions.
- Explicitly revise scope.

### Phase B — Product discovery and requirements

| ID    | Task                        | Deliverable                                        |
| ----- | --------------------------- | -------------------------------------------------- |
| M8-06 | Product intake              | Structured product input                           |
| M8-07 | Problem and user analysis   | Product brief                                      |
| M8-08 | Feature decomposition       | Functional requirements                            |
| M8-09 | Non-functional requirements | Security, performance and reliability requirements |
| M8-10 | MVP scope definition        | MVP and out-of-scope boundaries                    |
| M8-11 | Requirements traceability   | Requirement-to-acceptance mapping                  |

The system should distinguish:

- Business requirements.
- Functional requirements.
- Non-functional requirements.
- Technical constraints.
- Assumptions.
- Unresolved decisions.

Important: It must not silently invent business rules when the developer provides an incomplete product idea. It should record assumptions and flag decisions requiring approval.

### Phase C — Architecture design

| ID    | Task                                    | Deliverable                                      |
| ----- | --------------------------------------- | ------------------------------------------------ |
| M8-12 | Architecture options                    | Alternative architecture proposals               |
| M8-13 | Component boundaries                    | Component and module map                         |
| M8-14 | Data modeling                           | Entity relationships and data definitions        |
| M8-15 | API design                              | OpenAPI or equivalent API contracts              |
| M8-16 | Authentication and authorization design | Security architecture                            |
| M8-17 | Integration design                      | External service contracts                       |
| M8-18 | Operational design                      | Deployment, configuration and observability plan |
| M8-19 | Architecture approval                   | ADRs and approved design baseline                |

Possible architecture decisions include:

- Modular monolith versus microservices.
- Relational versus document database.
- Synchronous versus asynchronous communication.
- REST versus GraphQL.
- Session-based versus token-based authentication.
- Background job processing.
- Caching and file storage.
- Deployment and scaling strategy.

Do not default to microservices or distributed infrastructure. The architecture must be justified by actual requirements.

### Phase D — Scaffolding and project foundation

| ID    | Task                           | Deliverable                           |
| ----- | ------------------------------ | ------------------------------------- |
| M8-20 | Scaffold contract              | Template and generator interface      |
| M8-21 | Template registry              | Versioned project templates           |
| M8-22 | Safe file generation           | Controlled file creation              |
| M8-23 | Configuration generation       | Environment and tooling configuration |
| M8-24 | Initial quality setup          | Lint, tests, typecheck and build      |
| M8-25 | Initial application validation | Buildable generated application       |

Proposed structure:

```
templates/
├── node-typescript-api/
├── react-typescript/
├── rails-api/
├── fullstack-node-react/
└── fullstack-rails-react/
```

These templates should be versioned and tested as actual applications. They must not become collections of stale snippets.

The scaffolder must:

- Show its planned file operations.
- Avoid overwriting existing files silently.
- Preserve user configuration.
- Validate template variables.
- Record generated files.
- Support safe recovery from interrupted generation.

### Phase E — MVP implementation planning

| ID    | Task                         | Deliverable                     |
| ----- | ---------------------------- | ------------------------------- |
| M8-26 | MVP feature sequencing       | Ordered feature roadmap         |
| M8-27 | Vertical-slice decomposition | End-to-end implementation tasks |
| M8-28 | Dependency graph generation  | Validated task graph            |
| M8-29 | Initial release planning     | MVP release boundary            |
| M8-30 | Implementation approval      | Approved execution plan         |

Example:

```
MVP
├── Foundation
├── User registration
├── Authentication
├── Organization management
├── Project management
├── Task management
├── Role-based access
└── Release preparation
```

Each slice must specify its backend, frontend, data, integration and verification requirements where applicable.

### Phase F — Implementation and verification

| ID    | Task                               | Deliverable                       |
| ----- | ---------------------------------- | --------------------------------- |
| M8-31 | Integrate M5 implementation engine | Shared task execution             |
| M8-32 | Integrate M6 verification engine   | Shared quality gates              |
| M8-33 | Vertical-slice execution           | Incrementally working application |
| M8-34 | Cross-feature regression           | Regression evidence               |
| M8-35 | Independent architecture review    | Architecture review report        |
| M8-36 | Independent code review            | Code review report                |
| M8-37 | Release preparation                | Release readiness report          |

### Phase G — Persistence and recovery

| ID    | Task                          | Deliverable                   |
| ----- | ----------------------------- | ----------------------------- |
| M8-38 | Save approved workflow state  | Persistent workflow data      |
| M8-39 | Resume interrupted generation | Recovery mechanism            |
| M8-40 | Track scope changes           | Change history                |
| M8-41 | Track architecture changes    | ADR and requirement updates   |
| M8-42 | Validate workflow consistency | State and artifact validation |

A developer must be able to close a session and continue the application workflow without regenerating the entire plan.

## 2.4 M8 expected artifacts

```
project/
│
├── .ai-kit/
│   ├── project.yml
│   ├── state/
│   │   └── application-workflow.json
│   └── reports/
│
├── docs/
│   ├── product/
│   │   ├── BRIEF.md
│   │   └── PRD.md
│   │
│   ├── requirements/
│   │   ├── FUNCTIONAL.md
│   │   └── NON-FUNCTIONAL.md
│   │
│   ├── architecture/
│   │   ├── OVERVIEW.md
│   │   ├── COMPONENTS.md
│   │   ├── DATA-MODEL.md
│   │   └── adr/
│   │
│   ├── api/
│   ├── security/
│   ├── plans/
│   ├── testing/
│   └── releases/
│
├── src/
├── tests/
└── ...
```

## 2.5 M8 acceptance criteria

M8 cannot be considered complete just because it creates a folder structure.

- `/kit:app` accepts a product brief.
- Requirements are generated and validated.
- Architecture decisions are documented.
- Security and operational requirements are considered.
- MVP tasks form a valid dependency graph.
- Scaffolding generates a buildable application.
- Generated code passes the configured initial quality checks.
- Features are implemented through the shared M5 engine.
- Verification uses the shared M6 engine.
- The workflow supports interruption and resumption.
- Scope changes are recorded.
- Final release readiness has evidence.

M8 completion test: Build a new full-stack application from a product brief and get it to a working, verified MVP through incremental vertical slices.

# 3. M9 — Bug-fix and refactoring workflows

High priority

M9 should deliver two distinct workflows. Do not merge them into one generic maintenance command.

## 3.1 Bug-fix workflow

Command:

```
/kit:fix
```

Example:

> The application creates duplicate invoices when the payment provider sends the same webhook more than once.

Expected lifecycle:

```
Bug Report
    |
    v
Repository Discovery
    |
    v
Reproduction
    |
    v
Root Cause Analysis
    |
    v
Regression Test
    |
    v
Minimal Fix
    |
    v
Focused Verification
    |
    v
Regression Verification
    |
    v
Independent Review
    |
    v
Completion Report
```

### M9 bug-fix tasks

| ID    | Task                          | Deliverable                                           |
| ----- | ----------------------------- | ----------------------------------------------------- |
| M9-01 | Define bug report contract    | Structured bug input                                  |
| M9-02 | Bug classification            | Functional, regression, data, security or performance |
| M9-03 | Reproduction workflow         | Reproduction steps and evidence                       |
| M9-04 | Affected-code discovery       | Impact map                                            |
| M9-05 | Root cause analysis           | Root cause report                                     |
| M9-06 | Regression test generation    | Failing regression test                               |
| M9-07 | Minimal-change implementation | Corrective change                                     |
| M9-08 | Focused verification          | Test evidence                                         |
| M9-09 | Regression verification       | Broader test evidence                                 |
| M9-10 | Review and reporting          | Final bug-fix report                                  |

### Critical rules

- Do not fix a symptom without investigating the root cause.
- Do not delete or weaken a failing test to make the build green.
- Do not claim reproduction when only a theoretical explanation exists.
- A non-reproducible issue must be reported as such.
- Changes must remain within the approved scope unless the developer authorizes expansion.

## 3.2 Refactoring workflow

Command:

```
/kit:refactor
```

Example:

> Refactor the invoice processing module. Reduce coupling and improve testability without changing public behavior.

### Refactoring tasks

| ID    | Task                        | Deliverable                      |
| ----- | --------------------------- | -------------------------------- |
| M9-11 | Define refactoring contract | Structural-change specification  |
| M9-12 | Discover dependencies       | Caller and dependency map        |
| M9-13 | Capture current behavior    | Characterization tests           |
| M9-14 | Define target structure     | Refactoring design               |
| M9-15 | Identify candidate patterns | Justified design recommendations |
| M9-16 | Incremental refactoring     | Small structural changes         |
| M9-17 | Public-contract validation  | Behavior compatibility evidence  |
| M9-18 | Regression testing          | Regression report                |
| M9-19 | Quality comparison          | Before/after analysis            |
| M9-20 | Independent review          | Refactoring review report        |

### Refactoring constraints

- Preserve observable behavior unless behavior changes are explicitly approved.
- Establish baseline tests before structural changes.
- Do not use a design pattern simply because it exists.
- Avoid broad renaming or formatting changes unrelated to the task.
- Review public APIs and data contracts for compatibility.

## 3.3 Optional M9 extension: Performance optimization

I recommend keeping performance as a separate workflow rather than hiding it inside generic refactoring.

Command:

```
/kit:optimize
```

Potential workflow:

1. Define the performance problem.
2. Establish a reproducible baseline.
3. Profile the bottleneck.
4. Propose optimization alternatives.
5. Define measurable targets.
6. Implement one change at a time.
7. Benchmark using the same environment.
8. Run correctness and regression tests.

### M9 acceptance criteria

- Bug reproduction and refactoring have distinct workflows.
- Bug fixes include regression tests.
- Refactoring starts with a behavior baseline.
- Both use M5 and M6.
- Scope and affected areas are recorded.
- Final reports distinguish proven findings from hypotheses.
- Performance optimization requires baseline measurements.

# 4. M10 — Runtime Governance Mod

Plugin: `sdlc-guard`

Objective: Prevent unsafe agent operations from executing without the required approval.

### Capabilities

| Operation                       | Governance behavior                     |
| ------------------------------- | --------------------------------------- |
| Destructive file deletion       | Review impact and apply approval policy |
| Bulk modifications              | Assess affected scope                   |
| Database migrations             | Require configured approval             |
| Production database mutations   | Require explicit authorization          |
| Git force push                  | Approval gate                           |
| Deployment                      | Release approval                        |
| Dependency removal              | Impact review                           |
| Sensitive configuration changes | Apply protected-file policy             |

### Tasks

| ID     | Task                                  | Deliverable                     |
| ------ | ------------------------------------- | ------------------------------- |
| M10-01 | Define action classification contract | Typed action categories         |
| M10-02 | Build pure policy evaluator           | Deterministic policy engine     |
| M10-03 | Define policy schema                  | Versioned policy configuration  |
| M10-04 | Implement Claude event adapter        | Runtime integration             |
| M10-05 | Implement approval flow               | Explicit decision handling      |
| M10-06 | Implement non-interactive behavior    | Deterministic unattended policy |
| M10-07 | Add audit events                      | Approval and denial records     |
| M10-08 | Add adversarial tests                 | Bypass and edge-case coverage   |
| M10-09 | Add policy documentation              | Operator guide                  |

### Design principle

Policy evaluation must be separate from event interception.

```
Claude Code Event
       |
       v
Runtime Adapter
       |
       v
Action Normalizer
       |
       v
Policy Engine
       |
       +--> Allow
       +--> Ask
       +--> Deny
       |
       v
Audit Event
```

Do not represent the Mod as a security sandbox. Host permissions, OS isolation, container boundaries and credential controls remain necessary.

### Acceptance

- All supported protected operations have tests.
- Policies are deterministic and versioned.
- Non-interactive behavior is explicit.
- Approval cannot be inferred from an unrelated previous action.
- Denials are recorded.
- The Mod cannot silently weaken host-level restrictions.

# 5. M11 — Secret Guard Mod

Plugin: `secret-guard`

Objective: Protect credentials and sensitive values throughout agent execution.

### Areas of protection

1. Tool output.
2. File reads.
3. File writes and edits.
4. Notebook edits.
5. Git staging.
6. Git commits.
7. Git pushes.
8. MCP tool responses where supported.

### Tasks

| ID     | Task                            | Deliverable                      |
| ------ | ------------------------------- | -------------------------------- |
| M11-01 | Define finding contract         | Standardized secret finding      |
| M11-02 | Build detection engine          | Built-in detection rules         |
| M11-03 | Add Gitleaks integration        | Optional extended scanner        |
| M11-04 | Implement output redaction      | Safe tool output                 |
| M11-05 | Implement write scanning        | File modification protection     |
| M11-06 | Implement staged-diff scanning  | Pre-commit protection            |
| M11-07 | Implement commit/push scanning  | Git operation protection         |
| M11-08 | Add ignore policy               | Controlled exclusions            |
| M11-09 | Define scanner failure behavior | Explicit failure policy          |
| M11-10 | Add adversarial test suite      | Detection and redaction evidence |

### Important security distinction

Secret detection and secret redaction are different operations.

A finding does not prove that every occurrence of that secret has been redacted. Tests must verify exact coverage across all supported output paths.

### Acceptance

- No test prints actual secret values in diagnostic output.
- Scanner failures are visible.
- Ignored files follow explicit rules.
- Redaction is tested against repeated and partial occurrences.
- Oversized and unreadable input is not reported as successfully scanned.
- False-positive handling is documented.

# 6. M12 — Model and effort Router Mod

Plugin: `model-router`

Objective: Select an appropriate model and reasoning effort for a task without wasting tokens or ignoring risk.

### Inputs

- Task type.
- Task complexity.
- Risk.
- Required capabilities.
- Context size.
- Explicit user selection.
- Previous execution and verification outcomes.

### Tasks

| ID     | Task                                | Deliverable                    |
| ------ | ----------------------------------- | ------------------------------ |
| M12-01 | Define routing contract             | Typed routing request          |
| M12-02 | Define capability registry          | Model capability metadata      |
| M12-03 | Define routing policy               | Rules and priorities           |
| M12-04 | Implement complexity classification | Task complexity                |
| M12-05 | Implement risk classification       | Risk profile                   |
| M12-06 | Implement main-turn routing         | Main model selection           |
| M12-07 | Implement subagent routing          | Agent model selection          |
| M12-08 | Add effort selection                | Reasoning-effort policy        |
| M12-09 | Add fallback behavior               | Provider/model fallback        |
| M12-10 | Add verification-based escalation   | Retry and escalation decisions |
| M12-11 | Add explainability                  | Routing decision report        |
| M12-12 | Add evaluation tests                | Routing quality report         |

### Example routing policy

| Workload                     | Complexity | Risk     | Strategy                                                    |
| ---------------------------- | ---------- | -------- | ----------------------------------------------------------- |
| Simple documentation update  | Low        | Low      | Lightweight model and effort                                |
| CRUD endpoint                | Medium     | Medium   | General engineering model                                   |
| Authorization redesign       | High       | High     | Stronger reasoning and review                               |
| Production database deletion | Low        | Critical | Approval gate; model routing is irrelevant to authorization |
| Complex system review        | High       | High     | Strong analysis and independent review                      |

Critical: The router cannot be the authority for security. A more powerful model does not grant permission to perform a restricted action.

### Acceptance

- Explicit model choices are preserved.
- Main-turn and subagent routing are distinguishable.
- Effort and model are chosen independently.
- Deterministic fallback is available.
- Routing decisions are explainable.
- Ordinary routing does not require a network-based AI classifier.

# 7. M13 — Run Observer Mod

Plugin: `run-observer`

Objective: Make execution transparent without introducing a large monitoring system unnecessarily.

### Data model

Track:

- Workflow ID.
- Run ID.
- Session ID.
- Agent ID.
- Tool call ID.
- Model and effort.
- Start and finish time.
- Execution outcome.
- Verification results.
- Retry/escalation history.
- Token usage and cost when available.

### Tasks

| ID     | Task                          | Deliverable              |
| ------ | ----------------------------- | ------------------------ |
| M13-01 | Define event contract         | Versioned event schema   |
| M13-02 | Define event lifecycle        | Session/run/step model   |
| M13-03 | Implement collector           | Event ingestion          |
| M13-04 | Implement local persistence   | Event storage            |
| M13-05 | Implement telemetry redaction | Privacy-safe events      |
| M13-06 | Implement run summaries       | CLI report               |
| M13-07 | Add verification correlation  | Run-to-quality evidence  |
| M13-08 | Add usage metrics             | Resource and cost report |
| M13-09 | Add retention policy          | Storage and cleanup      |
| M13-10 | Add optional visualization    | Dashboard or UI          |

### First release interface

```
kit runs
kit runs show RUN-001
kit runs report RUN-001
kit runs failed
```

Start with CLI observability. Build a dashboard only when the event model and actual usage justify it.

### Acceptance

- Missing telemetry is not misrepresented as zero.
- Event collection does not block the engineering workflow unnecessarily.
- Sensitive output is redacted.
- Run history can be correlated with verification evidence.
- Retention and cleanup are configurable.

# 8. M14 — Technology and design pattern packs

Objective: Make the core workflow reusable across technology stacks.

### Initial stack packs

[Critical Alert: New React Server Components Vulnerabilities (Dec 2025) | by Udaykumar Dhokia | Dec, 2025 | Medium](https://images.openai.com/static-rsc-4/3gJjcskWGC-Ju2n7nI8kpyyXws5TfgjA9xMxqcsxMv7WTH214DgVbi0GCgAi8TW6yQNbwGHhncmzYyqERbpMYmjdghx_ehvqVG-SzMhm6HBMiIWnrN7sr_NUT5UltFxqsWCFYRnvU6vT688Jt_IEIDO0Vu2bd2RWiiaE5j7apFU?purpose=inline)

Node.js / TypeScript

Express, API design, validation, modularity, async processing, testing, error handling and security.

[React + TypeScript: Smarter State Management with useState and readonly - DEV Community](https://images.openai.com/static-rsc-4/cacXJztmtcgtvVsBKfWaXGT7KjINjxpaLYcQHFnN8yvF8coav1A9NP8Fy844rX8KvbfkRo7YNvD2DU57pGHVGqyAeUhLrZKdAx6B_0Ixc48wK26uoOcqG7S1C0IGjRV1RUkFgLwE6t6zXRtjAqKUHicH7jxl72Wea9x0ZTdO2t8?purpose=inline)

React / TypeScript

Component architecture, hooks, state management, forms, accessibility, data fetching and UI tests.

[Ruby on rails アイコン、ロゴ、シンボル – 無料ダウンロード PNG、SVG](https://images.openai.com/static-rsc-4/F_PLzrHDqnapRDk64j6cW9Oe3djSTD-lP-3IO7ZHS1HJnOuPitAL5wHk7ZIKbGQjMg8E-E-hT9NbsGu9sZGTDvp6IL2PfMIwbtGAI8YFRZ9xxJN8zCVXIxp2m2ifizibF6BlPRpoKPBXmUhmyVG02WLdAwNZztvP2XIkw4O8QqY?purpose=inline)

Ruby on Rails

MVC, Active Record, services, background jobs, API architecture, RSpec, migrations and security.

[File:Python logo 01.svg - Wikimedia Commons](https://images.openai.com/static-rsc-4/4WQnbUUJdvO4G_O54H-9RXYeiNC8ap-hadl7zQO_37z43QV44clQv_3mffdRKUsamUYFp5veqRIRVDSmAnDHlkj1JtcAh46t9rVGeEsTz7Kfg4qMWcGYIrrsCkO7nIRnHcOOcRu-Lm-tFOE47ydEtspq6XPPqxxyX0kFOlIlqkM?purpose=inline)

Python

Application structure, typing, testing, packaging, dependency and service design.

[Go 1.27 - What's New, Support Lifecycle & EOL](https://images.openai.com/static-rsc-4/nSTskF2VCFMtisE6aphiw76p21kRIbLiDJvjpGcd8bcfiXl4cVSVD_i2Gq9cV8yx-nXNZgPiPzKFl10kciEqX5030-zNHhcv3iYuEUaAjVZEXDdQ6uOrY6KezXrbXh93xLTDegdwiG8rtQqOcCw7u9Bqk32ZWn0K0ImigCPmrlU?purpose=inline)

Go

Interfaces, packages, concurrency, errors, API development and testing.

### Tasks

| ID     | Task                         | Deliverable                    |
| ------ | ---------------------------- | ------------------------------ |
| M14-01 | Define stack-pack manifest   | Common pack contract           |
| M14-02 | Define skill loading rules   | Stack-specific Skill discovery |
| M14-03 | Create Node/TypeScript pack  | First backend pack             |
| M14-04 | Create React/TypeScript pack | Frontend pack                  |
| M14-05 | Create Rails pack            | Rails pack                     |
| M14-06 | Create Python pack           | Python pack                    |
| M14-07 | Create Go pack               | Go pack                        |
| M14-08 | Build pattern catalog        | Language-independent patterns  |
| M14-09 | Add stack examples           | Tested implementation examples |
| M14-10 | Add compatibility tests      | Pack/fixture verification      |

### Design pattern library structure

```
patterns/
├── architecture/
├── creational/
├── structural/
├── behavioral/
├── resilience/
├── data/
└── testing/
```

Each pattern must include:

- Problem addressed.
- When it applies.
- When not to use it.
- Structure and participants.
- Trade-offs.
- Implementation examples.
- Testing approach.
- Related patterns.
- Common anti-patterns.

Do not put all pattern knowledge into the root instructions. Load relevant references when a workflow needs them.

### Acceptance

Every stack pack must be independently versioned, validated against a real fixture, and usable without requiring other stack packs.

# 9. M15 — CLI installer and package manager

Objective: Provide a predictable lifecycle for installing and managing the kit.

### Commands

```
kit install
kit install --profile minimal
kit install --profile full-sdlc
kit install --stack node-typescript

kit list
kit update
kit doctor

kit uninstall --dry-run
kit uninstall
```

### Tasks

| ID     | Task                               | Deliverable                         |
| ------ | ---------------------------------- | ----------------------------------- |
| M15-01 | Define package manifest            | Versioned package metadata          |
| M15-02 | Define installation profile        | Minimal/full/runtime/stack profiles |
| M15-03 | Implement discovery                | Available package listing           |
| M15-04 | Implement project installation     | Repository-scope install            |
| M15-05 | Implement user installation        | User-scope install                  |
| M15-06 | Implement ownership manifest       | Track kit-managed files             |
| M15-07 | Implement safe upgrade             | Non-destructive update              |
| M15-08 | Implement dry-run uninstall        | Removal preview                     |
| M15-09 | Implement uninstall                | Remove only kit-owned content       |
| M15-10 | Implement compatibility validation | Version checks                      |
| M15-11 | Implement rollback/recovery        | Failure recovery                    |
| M15-12 | Add integration tests              | Install lifecycle coverage          |

### Non-negotiable installer guarantees

- No silent overwrites.
- Idempotent installation.
- Explicit ownership tracking.
- Safe symlink handling.
- User files preserved.
- Dry-run available.
- Interrupted operations recover safely.
- Uninstall removes only owned resources.

Acceptance: installation, repeated installation, upgrade and uninstall all work without damaging unrelated project configuration.

# 10. M16 — CI/CD and release management

Objective: Make every product release reproducible, tested and auditable.

### CI pipeline

```
Pull Request
    |
    v
Dependency Installation
    |
    v
Formatting + Lint
    |
    v
Type Checking
    |
    v
Unit Tests
    |
    v
Integration Tests
    |
    v
Contract Tests
    |
    v
Plugin Validation
    |
    v
Security Scanning
    |
    v
Build + Package
    |
    v
Compatibility Matrix
    |
    v
Release Approval
```

### Tasks

| ID     | Task                          | Deliverable                     |
| ------ | ----------------------------- | ------------------------------- |
| M16-01 | Define CI quality gates       | Required PR checks              |
| M16-02 | Build package pipeline        | Reproducible packages           |
| M16-03 | Validate plugin layouts       | Plugin checks                   |
| M16-04 | Define compatibility matrix   | Supported version matrix        |
| M16-05 | Add automated security checks | Dependency and source scans     |
| M16-06 | Define version policy         | SemVer and compatibility rules  |
| M16-07 | Automate changelog generation | Release notes                   |
| M16-08 | Implement release tagging     | Versioned releases              |
| M16-09 | Implement publishing          | Package/marketplace publication |
| M16-10 | Add post-release smoke tests  | Published artifact validation   |
| M16-11 | Define rollback procedure     | Release recovery                |
| M16-12 | Add release evidence report   | Audit-ready release record      |

### Acceptance

- All required checks execute on pull requests.
- A release cannot silently bypass mandatory checks.
- Published artifacts can be traced to a commit.
- Supported runtime versions are tested.
- Release notes correspond to actual changes.
- Post-release validation checks the published package, not merely the source tree.

# 11. M17 — Security, reliability and production hardening

Objective: Prove the system can withstand realistic failure conditions and hostile or malformed inputs.

This milestone is not another feature-development phase. It is a comprehensive test and hardening effort across all previous milestones.

### Workstreams

| Workstream           | Focus                                       |
| -------------------- | ------------------------------------------- |
| Workflow reliability | Resume, retries, interrupted execution      |
| File safety          | Path traversal and overwrite protection     |
| Executor safety      | Argument validation and process boundaries  |
| Runtime security     | Approval bypass and adapter behavior        |
| Secret protection    | Detection/redaction completeness            |
| Installer security   | Ownership, links and rollback               |
| State integrity      | Corruption and schema migration             |
| Privacy              | Logs, telemetry and retention               |
| Performance          | Large repositories and bounded resource use |
| Compatibility        | Runtime version regressions                 |

### Tasks

| ID     | Task                                | Deliverable                     |
| ------ | ----------------------------------- | ------------------------------- |
| M17-01 | Build threat-model review           | Updated threat model            |
| M17-02 | Add adversarial test suite          | Security fixtures               |
| M17-03 | Test executor boundaries            | Safe process-execution evidence |
| M17-04 | Test workflow interruption          | Recovery evidence               |
| M17-05 | Test persistent state migrations    | State compatibility evidence    |
| M17-06 | Test file-system boundaries         | Path and symlink protection     |
| M17-07 | Perform dependency audit            | Dependency risk report          |
| M17-08 | Perform performance testing         | Baseline and benchmark report   |
| M17-09 | Perform compatibility testing       | Supported-runtime results       |
| M17-10 | Close critical findings             | Remediation evidence            |
| M17-11 | Perform independent security review | Security review report          |
| M17-12 | Prepare 1.0 release criteria        | Release readiness decision      |

### Acceptance

- No unresolved critical security finding.
- High-severity findings have been remediated or explicitly accepted by the responsible owner.
- Recovery behavior is tested.
- Performance limits are documented.
- Security and privacy policies are validated against actual behavior.
- All mandatory compatibility and quality gates pass.

# 12. M18 — Runtime and external integrations

Objective: Expand beyond one runtime and connect the SDLC workflow with external engineering systems.

### Runtime adapter architecture

```
             SDLC Core
                 |
      Runtime Adapter Contract
                 |
       +---------+---------+
       |         |         |
    Claude     Codex    Future Host
    Adapter    Adapter   Adapter
```

The runtime adapters translate host-specific events, commands, Skills and policies into common platform behavior.

Do not introduce a second workflow engine for every runtime.

### Tasks

| ID     | Task                               | Deliverable                     |
| ------ | ---------------------------------- | ------------------------------- |
| M18-01 | Define runtime adapter interface   | Host-neutral contract           |
| M18-02 | Formalize Claude Code adapter      | Stable first adapter            |
| M18-03 | Evaluate Codex integration         | Capability and gap assessment   |
| M18-04 | Implement compatible adapter       | Additional runtime support      |
| M18-05 | Define capability negotiation      | Runtime feature discovery       |
| M18-06 | Define integration manifest        | Integration metadata            |
| M18-07 | Implement GitHub integration       | Issues and PR workflows         |
| M18-08 | Implement external tracker adapter | Jira/Linear or selected tracker |
| M18-09 | Define MCP integration model       | Controlled MCP capabilities     |
| M18-10 | Add integration security tests     | Permission and trust tests      |

### Important boundary

Not every runtime supports the same capabilities.

The core should ask an adapter what it supports. It must not pretend that a host provides an equivalent hook, approval mechanism or model-routing capability when it does not.

### Acceptance

- Core workflow behavior does not depend on a specific runtime.
- Unsupported capabilities are reported.
- Integrations declare their permissions.
- External calls and data handling are controlled.
- A second runtime passes shared workflow contract tests.

# 13. M19 — Evaluation and benchmarking framework

Strategically important

Objective: Prove whether the kit actually improves software delivery rather than merely producing more output.

Without evaluations, we will not know whether new Skills, Mods, agents, models or routing policies make the product better.

### What to measure

| Metric                        | What it tells us                                  |
| ----------------------------- | ------------------------------------------------- |
| Task completion rate          | Whether the requested work is delivered           |
| Acceptance-criteria pass rate | Whether the result satisfies requirements         |
| Regression rate               | Whether existing behavior is damaged              |
| Verification reliability      | Whether reported checks match actual execution    |
| Review defect rate            | Whether important defects survive review          |
| Retry count                   | How often the workflow needs recovery             |
| Human intervention count      | How frequently approval or correction is required |
| Time to verified completion   | Delivery efficiency                               |
| Token and model cost          | Resource efficiency                               |
| Security-policy violations    | Safety effectiveness                              |

### Tasks

| ID     | Task                                 | Deliverable                         |
| ------ | ------------------------------------ | ----------------------------------- |
| M19-01 | Define evaluation contract           | Standard evaluation case            |
| M19-02 | Create benchmark repository set      | Representative application fixtures |
| M19-03 | Create feature benchmark suite       | Existing-project feature tasks      |
| M19-04 | Create bug-fix benchmark suite       | Reproducible defects                |
| M19-05 | Create refactoring benchmark suite   | Behavior-preserving challenges      |
| M19-06 | Create greenfield benchmark suite    | New application tasks               |
| M19-07 | Create security benchmark suite      | Adversarial scenarios               |
| M19-08 | Record baseline results              | Initial benchmark                   |
| M19-09 | Compare workflow versions            | Regression and improvement results  |
| M19-10 | Compare routing policies             | Model and effort evaluation         |
| M19-11 | Add benchmark reporting              | Trend reports                       |
| M19-12 | Establish release quality thresholds | Evaluation release gates            |

### Critical evaluation principles

1. Compare the result with the same baseline task.
2. Do not reward more generated code.
3. Do not treat an AI-generated review as ground truth.
4. Measure correctness using executable tests and human-reviewed expectations.
5. Track failures, safety violations and cost together.
6. Keep evaluation results reproducible.

An overall score should never conceal a critical security failure or regression.

### Acceptance

Every meaningful change to workflow logic, model routing or runtime behavior can be evaluated against a stable benchmark set.

# 14. M20 — Team and organization governance

Objective: Make the kit usable by teams with shared engineering standards and controlled permissions.

This milestone is optional for the initial individual-developer product, but important if we eventually distribute it to engineering organizations.

### Capabilities

Shared policies

- Coding conventions.
- Testing requirements.
- Architecture standards.
- Security rules.
- Protected branches and files.
- Migration policies.
- Release approval rules.

Team workflows

- Shared project profiles.
- Reusable templates.
- Team-approved stack packs.
- Standardized ADRs.
- Review requirements.
- Audit records.

Permission model

| Role           | Typical capability                   |
| -------------- | ------------------------------------ |
| Developer      | Run standard workflows               |
| Reviewer       | Review specifications and changes    |
| Maintainer     | Manage project policies              |
| Security owner | Manage security policy               |
| Release owner  | Approve releases                     |
| Administrator  | Configure organization-wide settings |

These are proposed logical roles. The implementation must map them to actual host and organization permissions rather than assuming the local agent can enforce identity securely.

### Tasks

| ID     | Task                              | Deliverable                           |
| ------ | --------------------------------- | ------------------------------------- |
| M20-01 | Define organization policy schema | Shared policy format                  |
| M20-02 | Define policy inheritance         | Organization/project/local precedence |
| M20-03 | Define role contracts             | Permission metadata                   |
| M20-04 | Implement policy validation       | Conflict detection                    |
| M20-05 | Implement team templates          | Shared templates and defaults         |
| M20-06 | Implement audit export            | Machine-readable audit trail          |
| M20-07 | Define approval integrations      | External identity/approval boundary   |
| M20-08 | Implement policy compatibility    | Versioned policy enforcement          |
| M20-09 | Add organization fixture tests    | Multi-project validation              |
| M20-10 | Document deployment model         | Team adoption guide                   |

### Acceptance

- Organization policies cannot be silently overridden by project-level configuration.
- Policy precedence is explicit.
- Permission checks are grounded in trusted identity and host capabilities.
- Audit exports do not disclose sensitive information.
- Conflicting policy rules are detectable and explainable.

# 15. Shared Skills, Agents and Commands after M7

We should evolve the original set carefully. Do not add a new Skill for every task or a new agent for every discipline.

## Skills

| Skill                       | Main responsibility                         |
| --------------------------- | ------------------------------------------- |
| `repo-discovery`            | Understand the repository                   |
| `requirements-engineering`  | Define requirements and acceptance criteria |
| `system-design`             | Architecture and technical design           |
| `implementation-planning`   | Dependency-aware planning                   |
| `tdd-bdd`                   | Tests and implementation discipline         |
| `design-pattern-selection`  | Pattern selection and trade-offs            |
| `code-quality`              | Maintainability and refactoring             |
| `security-engineering`      | Threat modeling and secure development      |
| `release-engineering`       | Release readiness                           |
| `application-bootstrap`     | Greenfield project setup                    |
| `bug-investigation`         | Reproduction and root cause                 |
| `refactoring`               | Behavior-preserving structural improvements |
| `performance-engineering`   | Measurement and optimization                |
| `stack-pack-authoring`      | Create and validate stack packs             |
| `kit-extension-development` | Extend the platform                         |

## Agents

Keep the first set specialized and bounded:

1. Repository Analyst — read-only repository discovery.
2. Architecture Reviewer — architecture and dependency review.
3. Code Reviewer — independent implementation review.
4. Security Reviewer — security-focused review.
5. Test Analyst — test coverage and regression analysis.
6. Release Reviewer — release evidence and readiness analysis.

The primary agent should remain responsible for implementation orchestration. Agents should handle genuinely independent analysis rather than delegate every trivial operation.

## Public commands

```
/kit:init
/kit:inspect
/kit:spec
/kit:feature
/kit:app
/kit:fix
/kit:refactor
/kit:optimize
/kit:review
/kit:verify
/kit:release
/kit:doctor
```

The corresponding CLI operations should expose deterministic functionality:

```
kit init
kit inspect
kit doctor

kit validate-spec
kit validate-plan
kit verify
kit audit

kit runs
kit release-check

kit install
kit update
kit uninstall
```

Keep the distinction clear: an AI-facing command initiates a guided workflow; a CLI command executes a well-defined operation. They should not be interchangeable just because their names look similar.

# 16. Cross-milestone dependency plan

The following is the recommended sequence after M7.

## Post-M7 delivery streams

M7 complete — incremental feature workflow proven

Workflow stream

M8 — App

M9 — Maintenance

Runtime safety

M10 — Guard

M11 — Secret Guard

Runtime intelligence

M12 — Router

M13 — Observer

Engineering knowledge

M14 — Stack packs

M15 — Installer and package lifecycle

M16 — CI/CD and release

M17 — Production hardening

M18–M20 — Integrations, evaluation and organization governance

### What can be parallelized?

| Workstream            | Can start when                             | Constraint                                   |
| --------------------- | ------------------------------------------ | -------------------------------------------- |
| M8 application        | M7 complete                                | Reuse M3–M6 contracts                        |
| M9 maintenance        | M7 complete                                | Separate bug-fix and refactor state models   |
| M10 governance        | Runtime adapter contracts stable           | Policy engine must be independent of host    |
| M11 secret protection | Runtime adapter contracts stable           | Share safe finding/redaction contracts       |
| M12 router            | Main-turn and agent event contracts stable | Preserve explicit model choices              |
| M13 observer          | Event schema stable                        | Privacy and retention must be defined first  |
| M14 stack packs       | Core Skill and pack manifest stable        | Validate against real fixtures               |
| M19 evaluation        | Initial M7 benchmark available             | Build the benchmark incrementally            |
| M15 installer         | Package and plugin manifests stable        | Ownership tracking before uninstall          |
| M16 CI/CD             | Build and package structure stable         | Test actual published artifacts              |
| M17 hardening         | Feature-complete modules available         | Test integrated behavior                     |
| M18–M20               | Stable 1.0 interfaces                      | No uncontrolled dependency on host internals |

# 17. Required test environments

One of the biggest risks in building an AI developer kit is validating everything against toy examples.

We should maintain a permanent fixture suite.

| Fixture                  | Purpose                                         |
| ------------------------ | ----------------------------------------------- |
| `fixture-node-fullstack` | Existing Node.js/React/TypeScript application   |
| `fixture-rails-api`      | Existing Rails API with RSpec and database      |
| `fixture-greenfield`     | Empty project for M8                            |
| `fixture-legacy-app`     | Older codebase with weak conventions            |
| `fixture-large-monorepo` | Large repository discovery and context handling |
| `fixture-security`       | Secrets and destructive-action tests            |
| `fixture-failing-tests`  | Failure and recovery tests                      |

Every major release should be tested against the relevant fixtures.

### Example M8 acceptance scenario

```
Given an empty application directory
And a product brief
When the developer starts /kit:app
Then a product specification is generated
And architecture decisions are documented
And an MVP plan is validated
And a scaffolded application is created
And the application builds successfully
And vertical slices can be implemented incrementally
And verification evidence is persisted
```

### Example M9 acceptance scenario

```
Given an existing application with a reproducible defect
When the developer starts /kit:fix
Then the defect is reproduced
And the root cause is documented
And a regression test is added
And the minimal correction is implemented
And the required verification checks are executed
And a completion report is generated
```

# 18. Release strategy

The release plan should avoid waiting until M20 before delivering value.

| Release | Milestones | Product state                          |
| ------- | ---------- | -------------------------------------- |
| 0.6     | M8         | Greenfield application workflow        |
| 0.7     | M9         | Maintenance workflows                  |
| 0.8     | M10–M11    | Runtime security and governance        |
| 0.9     | M12–M14    | Routing, observability and stack packs |
| 0.10    | M15–M16    | Installation and automated releases    |
| 1.0     | M17        | Hardened production release            |
| 1.1     | M18        | Additional runtime integrations        |
| 1.2     | M19        | Evaluation and benchmarking            |
| 1.3     | M20        | Organization governance                |

Version labels are proposed, not published releases.

# 19. Risks that must be controlled

These are the areas most likely to damage the project if we do not establish boundaries.

| Risk                                            | Consequence                                        | Control                                         |
| ----------------------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| Separate app and feature implementation engines | Duplicated behavior and maintenance                | Shared M5/M6 engines                            |
| Overengineering architecture generation         | Slow, expensive workflows                          | Require justified architecture decisions        |
| Excessive agent delegation                      | More coordination, context and cost                | Delegate bounded independent work               |
| One Skill per tiny task                         | Noisy context and poor discoverability             | Group related procedures                        |
| Router on every event                           | Latency and cost increase                          | Deterministic, inexpensive routing              |
| Mod-based security treated as sandbox           | False security                                     | OS/container isolation and least privilege      |
| Overcomplicated observer dashboard              | Time spent building UI instead of useful workflows | CLI-first observability                         |
| Unvalidated templates                           | Stale or broken generated applications             | Build and test templates in CI                  |
| Unbounded task execution                        | Expensive and unreliable workflows                 | Small tasks, checkpoints and explicit approvals |
| Weak verification                               | False claims of completion                         | Evidence-backed reports and executable checks   |
| Overwriting user configuration                  | Damaged repositories                               | Ownership manifests and safe installation       |

# 20. Recommended execution priorities

I would not give every milestone equal priority. The business value and technical risk are different.

## Priority classification

P0 — Required for core product

Critical

M8, M9, M10, M11, M14, M15, M16, M17

P1 — Important product advantage

High

M12, M13, M19

P2 — Expansion

Later

M18, M20

M10 and M11 should be designed early enough to protect the runtime, but their implementation can be parallelized with M8/M9 after their shared contracts are stable.

M12 and M13 are useful differentiators, but they should not delay the core development workflows.

M19 should begin with a small evaluation suite as soon as M7 is available. Waiting until the end to measure effectiveness would be a mistake.

## 21. What constitutes completion of the whole roadmap?

The final product should be able to handle these four development scenarios:

| Scenario                     | Expected outcome                                                       |
| ---------------------------- | ---------------------------------------------------------------------- |
| New application              | Product idea to working, verified application                          |
| Existing application feature | Requirements to incremental implementation and regression verification |
| Bug fix                      | Reproducible defect to regression-tested correction                    |
| Refactoring                  | Existing behavior preserved while improving structure                  |

Across all four workflows, the kit should provide:

- Consistent engineering standards.
- Reusable design-pattern knowledge.
- Stack-specific implementation guidance.
- Deterministic test and quality automation.
- Security and destructive-operation controls.
- Independent review.
- Persistent project and workflow context.
- Reproducible evidence.
- Safe installation, upgrades and removal.
- Extensible runtime and integration contracts.

The final success criterion is not how many Skills, agents or Mods we have. It is whether the kit repeatedly turns software requirements into correct, tested, reviewed and maintainable software with less manual coordination and without sacrificing engineering control.

## 22. Recommended next implementation package

After M7 is accepted, I would start with the following concrete work package:

| Sequence | Work package                              | Gate                               |
| -------- | ----------------------------------------- | ---------------------------------- |
| 1        | M8 application workflow contracts         | Contract review                    |
| 2        | M8 discovery and requirements integration | Specification validation           |
| 3        | M8 architecture and planning integration  | Plan validation                    |
| 4        | M8 scaffold registry and generator        | Clean build of generated fixture   |
| 5        | M8 vertical-slice execution               | End-to-end MVP fixture             |
| 6        | M8 recovery and reporting                 | Interrupted/resumed workflow tests |
| 7        | M9 bug-fix workflow                       | Reproducible regression fixture    |
| 8        | M9 refactoring workflow                   | Behavior-preservation fixture      |
| 9        | M10–M11 shared security contracts         | Security architecture review       |
| 10       | M10–M11 independent Mods                  | Adversarial plugin tests           |

For implementation, each task should become a small PR or focused work unit with explicit acceptance criteria and verification evidence. Shared contracts should be reviewed before parallel development begins.

My recommendation is to make M8 the next major target, not to jump directly into model routing or dashboards. A system that can build a new application and maintain an existing one through controlled engineering workflows is the product. The Mods make that product safer and more efficient; they are not substitutes for it.

No implementation or repository changes have been made in this planning step.&#x20;

After completing M20, we should stop expanding the feature roadmap and start operating the Agentic SDLC Kit as a mature engineering product.

M0–M20 builds the product and its ecosystem. The next challenge is proving that it consistently improves software delivery, earns developer trust, remains maintainable and is worth adopting.

I would call the next stage:

# M21–M26: Product Operations, Adoption and Evolution

## The next stage

1. M21 — Real-world adoption and pilot program

   Validate the kit against real applications and development teams.

2. M22 — Operational excellence

   Establish reliability, support, security response and upgrade management.

3. M23 — Developer experience and usability

   Reduce friction in installation, configuration and daily workflows.

4. M24 — Ecosystem and marketplace governance

   Establish trusted distribution and extension lifecycle management.

5. M25 — Enterprise readiness

   Address compliance, deployment models, identity and organizational adoption.

6. M26 — Continuous product intelligence and evolution

   Use evaluation data and actual developer feedback to determine what should improve, change or be removed.

## 1. M21 — Real-world adoption and pilot program

Highest priority

The first thing we should do is use our own kit to build and maintain real software.

Do not immediately recruit hundreds of users or build additional features. Prove the workflows first.

### Pilot environments

| Environment                      | Work to validate                                             |
| -------------------------------- | ------------------------------------------------------------ |
| Node.js + TypeScript application | Greenfield, feature, bug fix and refactoring                 |
| React + TypeScript application   | UI architecture, component development and testing           |
| Ruby on Rails application        | Models, services, migrations, APIs and RSpec                 |
| Large existing repository        | Repository discovery, impact analysis and context management |
| Multi-developer project          | Shared policies, reviews and workflow consistency            |

### Tasks

- M21-01: Select representative pilot repositories.
- M21-02: Establish baseline development metrics before using the kit.
- M21-03: Run complete greenfield workflows.
- M21-04: Run incremental feature workflows.
- M21-05: Run bug-fix and refactoring workflows.
- M21-06: Collect developer feedback.
- M21-07: Record workflow failures and manual interventions.
- M21-08: Identify missing capabilities and unnecessary complexity.
- M21-09: Produce a pilot evaluation report.
- M21-10: Approve, revise or reject the next product roadmap.

Exit criteria: The kit demonstrates measurable improvements or identifies precisely where it fails. A successful demonstration is not sufficient; we need repeated results across different repositories.

## 2. M22 — Operational excellence

Once people depend on the kit, reliability becomes a product feature.

### Areas to establish

| Area          | Required capability                                  |
| ------------- | ---------------------------------------------------- |
| Reliability   | Recovery from interrupted workflows                  |
| Security      | Vulnerability handling and security advisories       |
| Compatibility | Supported runtime and plugin versions                |
| Releases      | Predictable release cadence                          |
| Support       | Bug reporting and triage                             |
| Diagnostics   | Actionable health reports                            |
| Migration     | Safe upgrades of project profiles and workflow state |
| Deprecation   | Controlled removal of obsolete functionality         |

### Additional requirements

Introduce:

- A documented support policy.
- A security disclosure process.
- A dependency-update policy.
- A release rollback procedure.
- Compatibility and migration guides.
- An incident-response playbook.
- A known-issues register.

Exit criteria: Users can install, operate, update and recover the kit without depending on its original developers for routine problems.

## 3. M23 — Developer experience and usability

The kit must become easier to use as it becomes more capable.

A common failure in developer tooling is accumulating hundreds of configuration options, Skills and commands until the product becomes harder to operate than the underlying development task.

### Work areas

Onboarding

- First-run setup.
- Interactive project initialization.
- Project-specific recommendations.
- Clear configuration diagnostics.

Workflow experience

- Clear progress indicators.
- Understandable blocked states.
- Approval requests with meaningful context.
- Resume interrupted work.
- Explainable verification failures.

Documentation

- Getting started.
- Complete workflow examples.
- Stack-specific guides.
- Extension development.
- Troubleshooting.
- Migration and upgrade guides.

Configuration

- Sensible defaults.
- Minimal mandatory configuration.
- Explicit advanced settings.
- Validated profiles.
- Clear configuration precedence.

### Possible command experience

```
kit init
kit doctor
kit inspect

kit app
kit feature
kit fix
kit refactor

kit verify
kit review
kit release
```

The commands shown are examples of the desired CLI experience, not a requirement to add duplicate commands if the existing interface already provides them.

Exit criteria: A developer unfamiliar with the project can install the kit, initialize a repository and complete a supported workflow using the documentation.

## 4. M24 — Ecosystem and marketplace governance

M18 establishes integration capabilities. M24 should make extensions trustworthy and manageable at ecosystem scale.

### Extension lifecycle

```
Extension Submission
        |
        v
Manifest Validation
        |
        v
Compatibility Validation
        |
        v
Security Review
        |
        v
Automated Testing
        |
        v
Approval / Publication
        |
        v
Version Management
        |
        v
Deprecation / Removal
```

### Extensions to support

- Community Skills.
- Specialized agents.
- Stack packs.
- Design pattern packs.
- Policy packs.
- Runtime adapters.
- Workflow extensions.
- Verification adapters.

### Required controls

- Package provenance.
- Version compatibility.
- Dependency declaration.
- Permission declarations.
- Publisher identity.
- Security scanning.
- Automated testing.
- Version pinning.
- Revocation and deprecation.

Critical: The marketplace must not become a mechanism for executing untrusted extensions with broad local access. A published extension needs a clear trust model and permission boundary.

## 5. M25 — Enterprise readiness

M20 already addresses organizational governance. M25 takes it further into operational and procurement readiness.

### Possible capabilities

| Area           | Capability                                                   |
| -------------- | ------------------------------------------------------------ |
| Identity       | Enterprise identity integration                              |
| Access         | Role-based access and trusted authorization                  |
| Deployment     | Controlled private deployment                                |
| Data handling  | Data retention and privacy controls                          |
| Audit          | Exportable activity and approval records                     |
| Policy         | Enforced organization-wide standards                         |
| Integration    | Enterprise Git and issue-tracking systems                    |
| Administration | Centralized configuration                                    |
| Compliance     | Evidence for applicable security and compliance requirements |

Do not build every enterprise feature by assumption. Prioritize based on actual requirements from prospective customers or internal adopters.

For example, an individual-developer product may not need centralized identity management or a hosted administration console.

Exit criteria: The product can be deployed and operated within the environments of its intended organizational users, with appropriate controls and documented limitations.

## 6. M26 — Continuous product intelligence and evolution

This should become an ongoing engineering program rather than a one-time feature milestone.

The kit should measure its own effectiveness and use that evidence to guide development.

### Evaluation dimensions

| Dimension       | Metric                                         |
| --------------- | ---------------------------------------------- |
| Delivery        | Time to verified completion                    |
| Correctness     | Acceptance-criteria pass rate                  |
| Reliability     | Workflow completion and recovery rate          |
| Quality         | Regression and escaped-defect rates            |
| Security        | Policy violations and secret exposure findings |
| Efficiency      | Token usage and execution cost                 |
| Usability       | Setup time and manual intervention count       |
| Adoption        | Repeat usage and active projects               |
| Maintainability | Extension compatibility and upgrade failures   |

### The feedback loop

```
Real Developer Usage
        |
        v
Execution and Evaluation Data
        |
        v
Failure and Friction Analysis
        |
        v
Prioritized Product Improvements
        |
        v
Implementation and Testing
        |
        v
Benchmark Comparison
        |
        v
Controlled Release
        |
        +--------> Real Developer Usage
```

### Continuous improvement rules

1. Add features only when there is evidence of a problem.
2. Remove unused or redundant Skills, Mods and scripts.
3. Keep the core small and stable.
4. Introduce new abstractions only when repeated use justifies them.
5. Test model and runtime changes against the benchmark suite.
6. Track cost, correctness and safety together.
7. Preserve backward compatibility wherever practical.

Exit criteria: Every major product change is supported by an observed problem, an explicit improvement objective and evaluation results.

# 7. What should the product look like after M20?

By that point, we should have four distinct product layers.

## Mature Agentic SDLC Kit

1\. Engineering intelligence

Skills, agents, commands, design patterns, architecture references and stack-specific knowledge.

2\. SDLC execution platform

Discovery, requirements, planning, implementation, verification, review, release and workflow persistence.

3\. Runtime and security platform

Mods, policy evaluation, model routing, secret protection, observability and runtime adapters.

4\. Ecosystem and organization platform

Stack packs, extension distribution, integrations, organization governance and compatibility management.

Product operations

Pilot programs, benchmarks, support, release management, security response and continuous improvement.

# 8. What we should deliberately NOT build yet

Even after M20, I would resist these additions until there is evidence of demand:

| Tempting addition                                       | Why to defer                                      |
| ------------------------------------------------------- | ------------------------------------------------- |
| Fully autonomous software organization                  | Difficult to govern and verify                    |
| AI-generated code for every repository without approval | Excessive operational risk                        |
| Mandatory multi-agent orchestration                     | Adds coordination cost                            |
| Custom model hosting                                    | Significant infrastructure and maintenance burden |
| Full web-based IDE                                      | Separate, large product scope                     |
| Real-time team collaboration platform                   | Not necessary for the core SDLC problem           |
| A huge extension marketplace                            | No value without trusted adoption                 |
| Automatic production deployments                        | Requires strong organization-specific controls    |

The goal is not to make the biggest agentic system. The goal is to make a dependable engineering system that developers can trust.

# 9. The next strategic decision

After M20, there are three possible directions. They are not mutually exclusive, but one should lead.

Recommended first

A. Developer-first product

Focus on individual developers, real-world workflows, onboarding, local execution, stack packs and reliability.

Best when the goal is a broadly useful open-source engineering toolkit.

B. Enterprise engineering platform

Focus on private deployment, access controls, governance, auditability, compliance and centralized administration.

Best when the goal is organizational adoption and enterprise customers.

C. Agentic development ecosystem

Focus on external runtime adapters, extension contributors, community stack packs and an extension distribution ecosystem.

Best when the core platform is stable and has established users.

## My recommendation

Choose A first, then B and C based on adoption evidence.

The logical progression is:

Build → Prove → Operate → Adopt → Expand → Sustain.

And there is one important change in how we should manage the roadmap: after M20, stop assuming that the next milestone must be another large numbered feature. Run a quarterly product review using actual usage, quality, security and adoption data. Sometimes the correct next milestone will be simplifying or removing something rather than adding it.

The real endpoint is not M26. It is a self-sustaining engineering product whose quality improves without its architecture becoming unnecessarily complex.

Yes. This should become a major capability of the mature Agentic SDLC Kit.

I would introduce a new architectural layer called the Continuous Learning and Self-Evolution Engine (CLSE).

Its purpose is to let the kit learn from its previous engineering work, identify weaknesses in its own workflows, propose improvements, test those improvements, and incrementally improve its own Skills, agents, Mods, scripts, patterns, and core implementation.

There is one critical distinction:

The kit should be capable of improving itself, but it should not have unrestricted permission to modify and deploy itself.

We want a controlled, evidence-driven improvement loop—not an autonomous agent rewriting its own rules whenever it encounters a failure.

The intended cycle is:

## Self-evolution lifecycle

1\. Engineering experience

Completed features, bugs, refactoring, reviews, failures and verification results

2\. Learning and evidence extraction

Identify recurring failures, successful approaches, inefficient steps and missing capabilities

3\. Improvement proposals

Generate hypotheses and prioritize possible improvements

4\. Isolated experimentation

Test proposed changes against historical tasks and benchmark repositories

5\. Independent evaluation

Compare correctness, reliability, security, cost and regressions against the baseline

6\. Approval and controlled integration

Review, approve and merge an improvement through the normal SDLC

7\. Continuous measurement

Observe whether the improvement actually produces better outcomes

The cycle repeats using the newly collected evidence.

This is not merely a memory feature. It combines engineering memory, analytics, evaluation, experimentation, version control and governance.

# 1. First, define what self-evolution actually means

There are two different capabilities we should build.

A. Learning from experience

The kit remembers relevant engineering knowledge and uses it in future tasks.

Examples:

- It learns the existing architecture of a repository.
- It remembers previous implementation decisions.
- It identifies a recurring testing mistake.
- It remembers which implementation approaches worked in a particular stack.
- It retrieves relevant solutions from previous projects where sharing is permitted.

B. Improving its own engineering capabilities

The kit identifies weaknesses in its own implementation and changes its own components.

Examples:

- Improve the `requirements-engineering` Skill.
- Improve the task decomposition algorithm.
- Add a missing validation script.
- Improve model-routing policies.
- Add a new reusable design pattern reference.
- Improve the workflow state machine.
- Fix a bug in the verification engine.
- Improve the CLI based on recurring user friction.

The second capability is more powerful. It means the kit uses the same SDLC process to improve its own SDLC implementation.

Initially, I recommend keeping the underlying foundation model unchanged and allowing the kit to evolve its surrounding engineering infrastructure:

| Component        | How it evolves                                        |
| ---------------- | ----------------------------------------------------- |
| Memories         | Automatically accumulate verified, scoped knowledge   |
| Skills           | Propose improvements based on recurring evidence      |
| Agents           | Improve instructions, responsibilities and evaluation |
| Commands         | Improve workflow orchestration                        |
| Design patterns  | Add or refine documented patterns                     |
| Stack packs      | Improve technology-specific practices                 |
| Scripts          | Generate tested improvements                          |
| Routing policies | Tune against evaluation results                       |
| Runtime Mods     | Propose and test behavioral improvements              |
| Core source code | Create normal reviewed pull requests                  |
| Foundation model | Optional future research, not an initial requirement  |

This gives us a realistic form of self-improvement without making model training a prerequisite.

Research published in 2026 is also exploring this distinction: agents can evolve persistent memories, tools, strategies and Skills while keeping their underlying model weights fixed. However, improvement is not guaranteed, and gains on familiar tasks do not necessarily generalize to unseen tasks.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://arxiv.org&sz=32)

arxiv.org+1

# 2. Introduce a new subsystem: Continuous Learning and Self-Evolution Engine

I recommend making this a first-class subsystem rather than scattering learning logic across the existing Mods and Skills.

Proposed architecture:

```
agentic-sdlc-kit/
│
├── packages/
│   │
│   ├── learning-core/
│   │   └── src/
│   │       ├── experience/
│   │       ├── evidence/
│   │       ├── feedback/
│   │       ├── memory/
│   │       ├── retrieval/
│   │       ├── distillation/
│   │       ├── lessons/
│   │       ├── hypotheses/
│   │       └── policies/
│   │
│   ├── evolution-engine/
│   │   └── src/
│   │       ├── proposal/
│   │       ├── prioritization/
│   │       ├── experiments/
│   │       ├── sandbox/
│   │       ├── evaluation/
│   │       ├── comparison/
│   │       ├── promotion/
│   │       └── rollback/
│   │
│   ├── evaluation/
│   │   └── src/
│   │       ├── benchmarks/
│   │       ├── datasets/
│   │       ├── metrics/
│   │       ├── regression/
│   │       └── reports/
│   │
│   └── core/
│
├── knowledge/
│   ├── engineering/
│   ├── architecture/
│   ├── patterns/
│   └── stack-packs/
│
├── evolution/
│   ├── proposals/
│   ├── experiments/
│   ├── accepted/
│   └── rejected/
│
└── benchmarks/
    ├── greenfield/
    ├── feature/
    ├── bug-fix/
    ├── refactor/
    └── security/
```

The boundaries are important:

- `learning-core` understands experience.
- `evolution-engine` proposes and experiments with improvements.
- `evaluation` measures whether an improvement is actually beneficial.
- `core` remains the production implementation of the kit.

The learning subsystem must not become an unrestricted alternative path for changing production code.

# 3. What exactly should the kit learn from?

Every completed workflow already produces useful information.

We should turn that information into structured engineering experience.

## 3.1 Sources of experience

| Source                            | What we can learn                              |
| --------------------------------- | ---------------------------------------------- |
| Successful feature implementation | Effective implementation procedures            |
| Failed implementation             | Missing assumptions and weak procedures        |
| Test failures                     | Missing test coverage or faulty implementation |
| Code review findings              | Recurring maintainability issues               |
| Architecture reviews              | Weak architectural decisions                   |
| Bug fixes                         | Root causes and regression patterns            |
| Refactoring                       | Effective structural improvements              |
| Verification reports              | Which checks detect defects                    |
| User corrections                  | Incorrect assumptions and workflow problems    |
| Approval decisions                | Whether proposed actions need better controls  |
| Model-routing results             | Which routing decisions are effective          |
| Runtime failures                  | Missing fallback or recovery mechanisms        |
| Developer feedback                | Usability and workflow friction                |

However, we must not treat every failed task as evidence that the kit is defective.

A failure could originate from:

- The application itself.
- Incorrect requirements.
- A model limitation.
- A broken external dependency.
- A developer changing the requirements.
- An incomplete project environment.
- The kit's own workflow or implementation.

The system must distinguish these causes before proposing changes.

## 3.2 Structured experience records

Do not use entire conversation transcripts as the learning database.

Create a normalized record:

```
interface ExperienceEpisode {
  id: string;
  runId: string;

  scope: {
    organizationId?: string;
    projectId?: string;
    stack?: string[];
  };

  workflow:
    | "app"
    | "feature"
    | "fix"
    | "refactor"
    | "release";

  taskFingerprint: string;

  kitVersion: string;
  runtimeVersion?: string;

  components: {
    skillVersions: Record<string, string>;
    agentVersions: Record<string, string>;
    modVersions: Record<string, string>;
    stackPackVersions: Record<string, string>;
  };

  outcome: {
    status: "success" | "partial" | "failed";
    acceptanceCriteriaPassed: number;
    acceptanceCriteriaFailed: number;
    regressionDetected: boolean;
  };

  evidence: {
    verificationReportId?: string;
    reviewReportId?: string;
    affectedFiles?: string[];
  };

  feedback?: {
    humanRating?: number;
    corrections?: string[];
    approved?: boolean;
  };

  timestamps: {
    startedAt: string;
    completedAt: string;
  };
}
```

This is an initial contract, not the final schema.

Keep sensitive source code, secrets, private prompts and user data out of shared learning records unless explicitly required and authorized. Store evidence references and minimal summaries by default.

# 4. Build a hierarchical engineering memory

I would use four primary memory types.

Level 1

Episodic memory — What happened?

Individual development runs, failures, successful solutions, decisions and verification evidence.

Level 2

Semantic memory — What do we know?

Verified architectural knowledge, project conventions, technology facts and design decisions.

Level 3

Procedural memory — How should we do it?

Reusable Skills, scripts, implementation recipes, testing strategies and troubleshooting procedures.

Level 4

Meta-memory — How should we learn?

Knowledge about which memories are useful, which should be retrieved, when they become stale and which learning strategies work.

### Example

Suppose the kit repeatedly implements API integrations and independent reviews discover that error handling is incomplete.

The learning lifecycle could be:

1. Episodic memory records the implementation and review findings.
2. Semantic memory identifies a recurring integration failure pattern.
3. Procedural memory proposes an API integration Skill improvement.
4. Meta-memory evaluates whether retrieving that Skill actually reduces similar failures.

The system should not just accumulate more notes. It should improve its ability to select and use the right knowledge.

A useful principle from recent work on controlled knowledge updating is to choose the least invasive update mechanism that is sufficient for the evidence and intended scope. Sometimes no persistent update is appropriate.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://pmc.ncbi.nlm.nih.gov&sz=32)

pmc.ncbi.nlm.nih.gov

# 5. Two learning loops: fast and slow

This is one of the most important architectural decisions.

We should not run the complete self-evolution process after every tool call.

Instead, establish two separate loops.

## 5.1 Fast learning loop — Per development task

Continuous

Runs when a task or workflow completes.

```
Task Completed
      |
      v
Collect Evidence
      |
      v
Normalize Outcome
      |
      v
Identify Reusable Knowledge
      |
      v
Validate Scope and Confidence
      |
      v
Update Project Memory
      |
      v
Make Knowledge Available
      |
      v
Next Development Task
```

Example:

The kit discovers that a particular Rails repository uses service objects and RSpec request specs for API functionality.

It updates the project's scoped knowledge and uses it in the next relevant task.

It does not automatically change the global Rails Skill because one repository follows a particular convention.

Fast-loop updates should generally be limited to scoped memory and evidence-backed notes.

## 5.2 Slow learning loop — Periodic self-improvement

Controlled evolution

Runs periodically or after enough relevant evidence accumulates.

For example, every 20 completed workflows, or when a recurring quality issue crosses a configured threshold.

```
Accumulated Experiences
        |
        v
Pattern and Failure Analysis
        |
        v
Generate Improvement Hypotheses
        |
        v
Prioritize Proposals
        |
        v
Create Isolated Experiments
        |
        v
Run Baseline and Candidate
        |
        v
Evaluate Results
        |
        v
Create Improvement PR
        |
        v
Human Approval
        |
        v
Release
```

The frequency should be based on evidence and evaluation cost, not an arbitrary schedule alone.

Fast learning improves the next task. Slow evolution improves the engineering system itself.

# 6. The self-improvement engine

Now the interesting part: how does the kit decide what to improve?

Introduce an Improvement Hypothesis Engine.

Every proposed improvement must describe a measurable problem and a testable solution.

### Example hypothesis

## Improvement proposal: Rails API integration Skill

Proposal ID: EVO-0042

Awaiting evaluation

Observed problem

Repeated integration changes have missed request-spec coverage for error responses.

Evidence

Multiple independent code reviews and verification reports identified missing error-path coverage.

Hypothesis

Adding explicit error-response scenarios to the relevant integration Skill and template will increase regression coverage.

Proposed change

Update `ruby-rails` integration testing guidance and add a fixture scenario.

Success metric

Higher error-path acceptance and regression test pass rates on held-out integration tasks.

Guardrails

No regression in existing tests, no unnecessary test duplication and no increase in unsafe generated code.

Experiment

Compare current Skill against candidate Skill using the same benchmark task set.

This is the key transition:

Do not ask the model to improve itself. Ask it to identify a specific, evidence-supported weakness and propose a testable improvement.

### Improvement categories

| Category              | Examples                              |
| --------------------- | ------------------------------------- |
| Knowledge improvement | Add missing engineering reference     |
| Skill improvement     | Improve implementation instructions   |
| Agent improvement     | Improve review responsibilities       |
| Workflow improvement  | Reduce unnecessary steps              |
| Script improvement    | Add a missing deterministic validator |
| Pattern improvement   | Improve decision guidance             |
| Routing improvement   | Choose more appropriate model/effort  |
| Core improvement      | Fix a defect or improve architecture  |
| Security improvement  | Close a demonstrated control gap      |

The engine should also be allowed to recommend doing nothing.

# 7. Evolution Lab — Never experiment on the production kit

This should be a separate, isolated environment.

When the engine proposes an improvement, it creates a candidate version rather than editing the live system.

```
Production Kit
     |
     v
Improvement Proposal
     |
     v
Evolution Branch
     |
     v
Candidate Kit Version
     |
     v
Isolated Benchmark Environment
     |
     v
Evaluation and Comparison
     |
     +---- Rejected
     |
     +---- Needs Revision
     |
     +---- Approved Candidate
                  |
                  v
             Pull Request
                  |
                  v
             Review + CI
                  |
                  v
                Merge
                  |
                  v
               Release
```

### Baseline versus candidate

For every proposed improvement, execute:

- Same benchmark tasks.
- Same base model where possible.
- Same runtime.
- Same project fixtures.
- Same evaluation criteria.
- Same tool permissions.
- Controlled and recorded environment.

Only the proposed component should change.

For example:

| Measurement                   | Baseline | Candidate |
| ----------------------------- | -------- | --------- |
| Acceptance criteria satisfied | 82%      | 91%       |
| Regression failures           | 6        | 3         |
| Average execution cost        | ₹100     | ₹108      |
| Human interventions           | 12       | 8         |

Illustrative numbers only; these are not measured kit results.

A candidate does not win merely because one metric improves.

It must also pass its guardrails.

The evaluation should include held-out tasks, repeated runs and different task ordering. Recent evaluations of self-improving agents specifically highlight generalization, learning cost and failure attribution as important measurements.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://arxiv.org&sz=32)

arxiv.org+1

# 8. Controlled self-modification: What can change automatically?

We need explicit autonomy levels.

| Level | Action                                                         | Authority                                |
| ----- | -------------------------------------------------------------- | ---------------------------------------- |
| L0    | Collect workflow evidence                                      | Automatic                                |
| L1    | Update project-local memory                                    | Automatic under configured privacy rules |
| L2    | Create reusable lesson proposals                               | Automatic                                |
| L3    | Generate Skill, template or stack-pack candidates              | Automatic in isolated branch             |
| L4    | Modify scripts, policies or core code                          | PR and mandatory CI                      |
| L5    | Merge changes to protected production branches                 | Human approval                           |
| L6    | Change security controls, identity boundaries or model weights | Explicit elevated human authorization    |

This protects against a serious failure mode: an AI system discovering that weakening a test or bypassing an approval improves its apparent task-completion score.

The evolution engine must never be allowed to weaken evaluation controls to make itself appear successful.

## Additional safeguards

- Protected benchmark definitions.
- Immutable historical evaluation records.
- Versioned Skills and policies.
- Independent reviewers.
- Human-controlled production promotion.
- Signed or traceable artifacts.
- Rollback to the previous version.
- Explicit authorization for changes to security rules.
- No learning from untrusted repository instructions as if they were trusted system policies.

# 9. The most important part: prevent learning the wrong lessons

We must account for the fact that an AI's explanation of a failure is not necessarily the actual root cause.

Suppose a generated implementation fails.

The model concludes:

> The repository architecture is too complex. We should introduce a new service layer.

That may be wrong. The actual problem might simply be an incorrect database query.

Therefore, the learning engine should require evidence.

A proposed lesson should include:

```
interface EngineeringLesson {
  id: string;
  title: string;

  claim: string;

  scope: {
    project?: string;
    stack?: string[];
    workflow?: string[];
  };

  evidence: Array<{
    episodeId: string;
    evidenceRef: string;
  }>;

  confidence: number;

  classification:
    | "verified"
    | "probable"
    | "hypothesis"
    | "rejected";

  applicability: string[];

  counterexamples: string[];

  createdAt: string;
  lastValidatedAt?: string;
  expiresAt?: string;
}
```

The confidence value must be supported by evidence and a defined scoring method. It should not just be a number invented by the LLM.

### Memory lifecycle

```
Candidate Lesson
      |
      v
Evidence Validation
      |
      v
Scope Assessment
      |
      v
Duplicate Detection
      |
      v
Approval / Automatic Scoped Storage
      |
      v
Retrieval Evaluation
      |
      v
Periodic Revalidation
      |
      +--> Retain
      |
      +--> Update
      |
      +--> Deprecate
      |
      +--> Forget
```

Stale knowledge must be replaceable. The system must not blindly preserve every lesson forever.

# 10. Separate project learning from global kit learning

This is essential when the kit operates across multiple repositories or organizations.

Project memory

Repository architecture, project conventions, project decisions, known failures and local implementation patterns.

Organization memory

Approved engineering standards, reusable internal patterns and organization-specific policies.

Global kit knowledge

Generalizable, verified engineering practices, reusable patterns, public stack guidance and improvements to the kit itself.

Example:

A project uses a custom authentication architecture. That should remain project memory.

A team consistently discovers a security issue across its own applications. That can become organization knowledge.

A reproducible weakness in our Rails stack pack, demonstrated by multiple permitted fixtures, can become a candidate global improvement.

Do not merge private application code or organization-specific information into a public knowledge base merely because the kit encountered it.

Global learning should use explicit contribution permissions, data minimization and appropriate anonymization.

# 11. Add a new roadmap: M27–M35

I would extend our existing roadmap with the following milestones.

| Milestone | Objective                                  | Deliverable                                           |
| --------- | ------------------------------------------ | ----------------------------------------------------- |
| M27       | Self-evolution architecture and governance | Evolution policies and contracts                      |
| M28       | Experience collection                      | Structured engineering episodes                       |
| M29       | Hierarchical memory system                 | Episodic, semantic and procedural memory              |
| M30       | Knowledge distillation                     | Verified reusable lessons                             |
| M31       | Improvement hypothesis engine              | Prioritized improvement proposals                     |
| M32       | Evolution Lab                              | Isolated candidate experiments                        |
| M33       | Controlled promotion                       | PR generation, approvals and rollback                 |
| M34       | Self-improvement evaluation                | Longitudinal benchmark system                         |
| M35       | Continuous meta-evolution                  | Learning policies and evolution strategy improvements |

## M27 — Architecture and governance

- M27-01: Define learning scope.
- M27-02: Define experience and evidence contracts.
- M27-03: Define autonomy levels.
- M27-04: Define privacy and retention policies.
- M27-05: Define change-promotion policy.
- M27-06: Define provenance and versioning.
- M27-07: Define rollback contracts.

## M28 — Experience collection

- M28-01: Integrate workflow events.
- M28-02: Integrate verification reports.
- M28-03: Integrate independent review reports.
- M28-04: Capture human corrections.
- M28-05: Normalize outcomes.
- M28-06: Redact sensitive data.
- M28-07: Create an experience store.
- M28-08: Add deduplication and retention.

## M29 — Hierarchical memory

- M29-01: Episodic memory.
- M29-02: Semantic memory.
- M29-03: Procedural memory.
- M29-04: Memory indexing and retrieval.
- M29-05: Project and organization isolation.
- M29-06: Memory provenance.
- M29-07: Expiry and invalidation.
- M29-08: Retrieval relevance evaluation.

## M30 — Knowledge distillation

- M30-01: Extract lessons from repeated episodes.
- M30-02: Identify recurring failure categories.
- M30-03: Identify successful implementation practices.
- M30-04: Detect conflicting lessons.
- M30-05: Validate evidence.
- M30-06: Generate Skill improvement candidates.
- M30-07: Generate stack-pack candidates.
- M30-08: Add lesson lifecycle management.

## M31 — Improvement hypothesis engine

- M31-01: Define hypothesis contract.
- M31-02: Identify repeated quality issues.
- M31-03: Detect inefficient workflow stages.
- M31-04: Identify missing verification coverage.
- M31-05: Generate candidate solutions.
- M31-06: Estimate impact, cost and risk.
- M31-07: Prioritize hypotheses.
- M31-08: Create experiment specifications.

## M32 — Evolution Lab

- M32-01: Isolated candidate workspace.
- M32-02: Baseline package pinning.
- M32-03: Candidate package generation.
- M32-04: Historical benchmark runner.
- M32-05: Held-out benchmark runner.
- M32-06: Repeated-run comparison.
- M32-07: Regression and safety gates.
- M32-08: Experiment report generation.

## M33 — Controlled promotion

- M33-01: Generate improvement branches.
- M33-02: Generate change summaries.
- M33-03: Run normal CI and security checks.
- M33-04: Request independent review.
- M33-05: Implement human approval.
- M33-06: Support staged rollout.
- M33-07: Monitor promoted changes.
- M33-08: Implement rollback and deprecation.

## M34 — Self-improvement evaluation

- M34-01: Define longitudinal performance metrics.
- M34-02: Measure knowledge reuse.
- M34-03: Measure learning efficiency.
- M34-04: Measure held-out generalization.
- M34-05: Measure regression and negative transfer.
- M34-06: Measure learning cost.
- M34-07: Add memory-on/memory-off controls.
- M34-08: Add evolution reports and trends.

## M35 — Continuous meta-evolution

This is the advanced stage.

The kit starts improving not only its engineering Skills, but also the mechanisms it uses to learn.

Examples:

- Determine which experience should become persistent memory.
- Improve memory retrieval strategy.
- Identify when memory is irrelevant.
- Determine when a new Skill is preferable to an additional rule.
- Improve how improvement hypotheses are prioritized.
- Improve which benchmarks are selected.
- Refine model/effort routing based on actual outcomes.

However, meta-evolution must use the same isolated experiments and approval gates. There is no special unrestricted self-modification privilege at this stage.

# 12. How should we measure whether the kit is getting smarter?

This needs careful treatment.

A rise in the number of stored lessons is not learning.

A reduction in the number of tokens is not necessarily improvement.

A higher success rate on tasks it has already seen might simply indicate overfitting.

We need multiple independent measurements.

| Metric                        | What it measures                                |
| ----------------------------- | ----------------------------------------------- |
| Future task success           | Whether performance improves on later tasks     |
| Held-out success              | Whether learning generalizes                    |
| Acceptance-criteria pass rate | Correctness against requirements                |
| Regression rate               | Damage to existing functionality                |
| Memory retrieval precision    | Whether relevant knowledge is selected          |
| Memory reuse rate             | Whether retrieved knowledge is actually applied |
| Lesson usefulness             | Whether a stored lesson improves outcomes       |
| Learning cost                 | Resources required to obtain improvement        |
| Human intervention            | Amount of manual correction needed              |
| Security violations           | Whether the system becomes less safe            |
| Recovery rate                 | Whether failures are handled better             |

One particularly useful measure would be:

\\[ \text{Learning Efficiency} = \frac{\text{Held-out Performance Gain}} {\text{Learning Cost}} \\]

Where learning cost includes compute, tokens, experiment runs and human review effort.

We should report both the gain and the cost rather than optimizing this ratio alone.

Research on Agent Plasticity emphasizes measuring held-out performance gains and learning cost, not just the final capability level. PAST-Bench also evaluates whether retained experiences were actually saved, retrieved, applied and updated, rather than accepting a performance increase without evidence of its cause.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://arxiv.org&sz=32)

arxiv.org+1

# 13. A concrete example: the kit improves its own TDD Skill

Let's imagine that after many completed development workflows, our evaluation system discovers this recurring problem:

Observation

In several independent feature tasks, the implementation passes unit tests but misses integration behavior.

Root cause hypothesis

The current `tdd-bdd` Skill overemphasizes unit tests and does not consistently require integration-boundary analysis.

Proposed improvement

Update the Skill with a requirement to identify relevant integration boundaries and existing integration tests before implementation.

The system then:

1. Collects the original execution traces and review findings.
2. Checks that the observations are independent.
3. Generates a candidate Skill revision.
4. Creates a benchmark containing historical and unseen feature tasks.
5. Runs baseline and candidate workflows.
6. Compares integration defects, acceptance results, regression tests and cost.
7. Rejects the candidate if it increases unnecessary test creation or degrades other workflows.
8. Opens an improvement PR if the candidate passes evaluation.
9. Runs the normal kit CI and review process.
10. Promotes the improvement after authorization.
11. Observes whether future tasks actually improve.

The kit has now used its own development process to improve one of its core development Skills.

That is the self-evolution behavior we are aiming for.

# 14. What I would build first

Do not start M27 by building a vector database, a complex multi-agent learning network or online model fine-tuning.

Start with the smallest complete learning loop.

First self-evolution vertical slice

M27 → M28 → M29 → M30 → M31 → M32 → M33

1. Capture completed workflow evidence.
2. Identify one recurring and verified weakness.
3. Create a scoped improvement hypothesis.
4. Generate a candidate Skill modification.
5. Compare baseline and candidate on a fixed benchmark.
6. Generate an improvement PR.
7. Require human approval and monitor the result.

The first test should use the kit's own `tdd-bdd` Skill or a Node.js/Rails stack pack. These are easier to benchmark than immediately attempting to modify the entire core architecture.

Definition of Done: The kit must demonstrate that it learned a genuinely reusable engineering lesson from previous work, that the lesson improved performance on previously unseen tasks, that it did not introduce unacceptable regressions, and that the resulting change was safely integrated into the kit.

## 15. Final architectural recommendation

I would now consider the Agentic SDLC Kit to have two major systems:

## Agentic SDLC Kit — Evolving architecture

System A — Software Engineering Engine

- Discover
- Specify
- Design
- Plan
- Implement
- Test
- Review
- Release
- Operate

Produces structured engineering experience

System B — Learning and Evolution Engine

- Observe
- Remember
- Learn
- Distill
- Analyze
- Hypothesize
- Experiment
- Evaluate
- Propose
- Improve

Improves the engineering engine through controlled updates

There is one further principle I would make permanent:

The system that proposes an improvement must not be the only system that decides whether that improvement is correct.

Keep independent verification, protected benchmarks, human-controlled promotion and rollback outside the authority of the improvement generator.

That gives us a practical objective: an engineering agent that gets better through accumulated experience, while remaining testable, explainable, reversible and under engineering control.
