import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Agentic SDLC Kit',
  description: 'Runtime-independent Agentic Software Development Lifecycle engine and toolkit',
  base: '/agentic-sdlc-kit/',

  themeConfig: {
    logo: undefined,
    siteTitle: 'Agentic SDLC Kit',

    nav: [
      { text: 'Guide', link: '/HOST_INTEGRATIONS' },
      { text: 'Workflows', link: '/workflows/WORKFLOWS' },
      { text: 'Architecture', link: '/architecture/ARCHITECTURE' },
      { text: 'Contracts', link: '/contracts/CONTRACTS' },
      { text: 'ADRs', link: '/adr/ADR-0001-typescript-primary-language' },
      {
        text: 'v0.8.0',
        items: [
          { text: 'Changelog / Release Notes', link: 'https://github.com/shubhamtaywade82/agentic-sdlc-kit/releases' },
          { text: 'Contributing', link: 'https://github.com/shubhamtaywade82/agentic-sdlc-kit/blob/main/CONTRIBUTING.md' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Host Integrations (Claude, Cursor, AGY, CI)', link: '/HOST_INTEGRATIONS' },
          { text: 'Skills Packs (ruby/node/react)', link: '/skills/SKILL_PACKS' },
          { text: 'Product Vision & Non-Goals', link: '/product/PRODUCT' },
          { text: 'System Requirements', link: '/requirements/REQUIREMENTS' },
          { text: 'Roadmap & Milestones', link: '/roadmap/ROADMAP' },
        ],
      },
      {
        text: 'Workflows & Engineering Process',
        items: [
          { text: 'Lifecycle Workflows & State Machines', link: '/workflows/WORKFLOWS' },
          { text: 'Testing & Verification Strategy', link: '/testing/TESTING' },
        ],
      },
      {
        text: 'Architecture & Governance',
        items: [
          { text: 'Monorepo Architecture & Invariants', link: '/architecture/ARCHITECTURE' },
          { text: 'Zod Contracts & Domain Schemas', link: '/contracts/CONTRACTS' },
          { text: 'Module Catalog & Boundaries', link: '/modules/MODULES' },
          { text: 'Security Model & Threat Boundaries', link: '/security/SECURITY' },
        ],
      },
      {
        text: 'Architecture Decision Records (ADRs)',
        collapsed: true,
        items: [
          { text: 'ADR-0001: TypeScript Primary Language', link: '/adr/ADR-0001-typescript-primary-language' },
          { text: 'ADR-0002: pnpm Workspaces', link: '/adr/ADR-0002-pnpm-workspaces' },
          { text: 'ADR-0003: Modular Monorepo', link: '/adr/ADR-0003-modular-monorepo' },
          { text: 'ADR-0004: Runtime-Independent Core', link: '/adr/ADR-0004-runtime-independent-core' },
          { text: 'ADR-0005: Claude Code First Adapter', link: '/adr/ADR-0005-claude-code-first-adapter' },
          { text: 'ADR-0006: Independently Installable Plugins', link: '/adr/ADR-0006-independently-installable-plugins' },
          { text: 'ADR-0007: Shared Contracts Workflow Engine', link: '/adr/ADR-0007-shared-contracts-workflow-engine' },
          { text: 'ADR-0008: Project YML Configuration', link: '/adr/ADR-0008-project-yml-configuration' },
          { text: 'ADR-0009: Explicit Approval Least Privilege', link: '/adr/ADR-0009-explicit-approval-least-privilege' },
          { text: 'ADR-0010: One Engine Many Entry Points', link: '/adr/ADR-0010-one-engine-many-entry-points' },
          { text: 'ADR-0011: Shared Security Contracts Before Mods', link: '/adr/ADR-0011-shared-security-contracts-before-mods' },
          { text: 'ADR-0012: Separate Bugfix Refactor Machines', link: '/adr/ADR-0012-separate-bugfix-refactor-state-machines' },
          { text: 'ADR-0013: CLI vs Slash Commands Distinct', link: '/adr/ADR-0013-cli-vs-slash-commands-distinct' },
          { text: 'ADR-0014: Mod SDK as Runtime Adapter', link: '/adr/ADR-0014-mod-sdk-as-runtime-adapter' },
          { text: 'ADR-0015: Four Focused Runtime Mods', link: '/adr/ADR-0015-four-focused-runtime-mods' },
          { text: 'ADR-0016: Self-Evolution Separate Subsystem', link: '/adr/ADR-0016-self-evolution-engine-separate-subsystem' },
          { text: 'ADR-0017: Two Learning Loops', link: '/adr/ADR-0017-two-learning-loops' },
          { text: 'ADR-0018: Adopting Pocock Practices', link: '/adr/ADR-0018-adopting-pocock-practices' },
          { text: 'ADR-0019: Hybrid Execution Model', link: '/adr/ADR-0019-hybrid-execution-model' },
          { text: 'ADR-0020: Capability & Permission Boundary', link: '/adr/ADR-0020-agent-capability-and-permission-boundary' },
          { text: 'ADR-0021: Host-Driven Agent Protocol', link: '/adr/ADR-0021-host-driven-agent-protocol' },
        ],
      },
    ],

    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/shubhamtaywade82/agentic-sdlc-kit' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Agentic SDLC Kit Contributors',
    },
  },
})
