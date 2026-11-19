// packages/core/src/stacks/stack-pack.ts
//
// M14 Technology stack packs: isolated stack-specific engineering knowledge,
// lifecycle command defaults, and conventions.

export interface StackPackManifest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultCommands: {
    test: string[][];
    lint?: string[][];
    typecheck?: string[][];
    build?: string[][];
  };
  readonly conventions: {
    entryPoints: string[];
    testFrameworks: string[];
    instructionFiles: string[];
  };
}

export const NODE_TYPESCRIPT_PACK: StackPackManifest = {
  id: "node-typescript",
  name: "Node.js / TypeScript",
  description: "Enterprise TypeScript stack with Vitest, ESLint, and strict compiler checking",
  defaultCommands: {
    test: [["pnpm", "test"]],
    lint: [["pnpm", "lint"]],
    typecheck: [["pnpm", "typecheck"]],
    build: [["pnpm", "build"]],
  },
  conventions: {
    entryPoints: ["src/index.ts", "src/main.ts"],
    testFrameworks: ["vitest", "jest", "node:test"],
    instructionFiles: ["AGENTS.md", "CLAUDE.md"],
  },
};

export const REACT_TYPESCRIPT_PACK: StackPackManifest = {
  id: "react-typescript",
  name: "React / TypeScript",
  description: "Frontend React stack with components, hooks, accessible UI, and Playwright/Vitest testing",
  defaultCommands: {
    test: [["pnpm", "test"]],
    lint: [["pnpm", "lint"]],
    build: [["pnpm", "build"]],
  },
  conventions: {
    entryPoints: ["src/App.tsx", "src/index.tsx", "pages/index.tsx", "app/page.tsx"],
    testFrameworks: ["vitest", "playwright"],
    instructionFiles: ["AGENTS.md"],
  },
};

export const RUBY_RAILS_PACK: StackPackManifest = {
  id: "ruby-rails",
  name: "Ruby on Rails",
  description: "Full-stack Rails with Active Record, Service Objects, RuboCop, and RSpec testing",
  defaultCommands: {
    test: [["bundle", "exec", "rspec"]],
    lint: [["bundle", "exec", "rubocop"]],
  },
  conventions: {
    entryPoints: ["config/routes.rb", "app/controllers/application_controller.rb"],
    testFrameworks: ["rspec", "minitest"],
    instructionFiles: ["AGENTS.md", "CLAUDE.md"],
  },
};

export const PYTHON_PACK: StackPackManifest = {
  id: "python",
  name: "Python / FastAPI",
  description: "Python stack with typing, ruff, mypy, and pytest testing",
  defaultCommands: {
    test: [["pytest"]],
    lint: [["ruff", "check", "."]],
    typecheck: [["mypy", "."]],
  },
  conventions: {
    entryPoints: ["main.py", "app/main.py"],
    testFrameworks: ["pytest", "unittest"],
    instructionFiles: ["AGENTS.md"],
  },
};

export const GO_PACK: StackPackManifest = {
  id: "go",
  name: "Go Modules",
  description: "Go stack with interfaces, golangci-lint, and go test",
  defaultCommands: {
    test: [["go", "test", "./..."]],
    lint: [["golangci-lint", "run"]],
    build: [["go", "build", "./..."]],
  },
  conventions: {
    entryPoints: ["main.go"],
    testFrameworks: ["go test"],
    instructionFiles: ["AGENTS.md"],
  },
};

const STACK_PACKS: ReadonlyMap<string, StackPackManifest> = new Map([
  [NODE_TYPESCRIPT_PACK.id, NODE_TYPESCRIPT_PACK],
  [REACT_TYPESCRIPT_PACK.id, REACT_TYPESCRIPT_PACK],
  [RUBY_RAILS_PACK.id, RUBY_RAILS_PACK],
  [PYTHON_PACK.id, PYTHON_PACK],
  [GO_PACK.id, GO_PACK],
]);

export function resolveStackPack(id: string): StackPackManifest | undefined {
  return STACK_PACKS.get(id);
}

export function listStackPacks(): StackPackManifest[] {
  return Array.from(STACK_PACKS.values());
}
