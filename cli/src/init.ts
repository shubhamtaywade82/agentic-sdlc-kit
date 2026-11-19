/**
 * `kit init` — discover the project, write `.ai/project.yml` and create the
 * standardized engineering directory skeleton.
 */

import * as fs from "fs";
import * as path from "path";
import { IO } from "./report";
import { serializeProfile, YamlMap } from "./yaml";
import { profileFilePath, ProjectProfile, ProjectMode, QualityCommand } from "./profile";

export type StackId = "rails" | "rails-ts" | "nextjs" | "node-ts-lib";
export const STACK_IDS: StackId[] = ["rails", "rails-ts", "nextjs", "node-ts-lib"];
export const MODES: ProjectMode[] = ["existing", "greenfield"];

export const KIT_DIRS = [
  ".ai/state",
  ".ai/reports",
  "docs/product",
  "docs/specifications/features",
  "docs/specifications/technical",
  "docs/plans",
  "docs/architecture/adr",
  "docs/testing",
  "docs/security/threat-models",
  "docs/releases",
];

export interface Discovery {
  name: string;
  mode: ProjectMode;
  stack: StackId | null;
  commands: QualityCommand[];
  detected: string[];
}

interface PackageJsonShape {
  name?: unknown;
  scripts?: unknown;
  dependencies?: unknown;
  devDependencies?: unknown;
}

function readPackageJson(root: string): PackageJsonShape | null {
  const file = path.join(root, "package.json");
  if (!fs.existsSync(file)) return null;
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as PackageJsonShape;
    }
  } catch {
    return null;
  }
  return null;
}

function keyStrings(value: unknown): Set<string> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? new Set(Object.keys(value)) : new Set();
}

/** Discover candidate profile values from the repository. */
export function discoverProject(root: string, overrides: { mode?: ProjectMode; stack?: StackId }): Discovery {
  const detected: string[] = [];
  const pkg = readPackageJson(root);
  const hasPackageJson = pkg !== null;
  const hasGemfile = fs.existsSync(path.join(root, "Gemfile"));

  // name
  let name = path.basename(path.resolve(root));
  if (pkg !== null && typeof pkg.name === "string" && pkg.name.trim() !== "") {
    name = pkg.name.trim();
    detected.push(`package name: ${name}`);
  } else {
    detected.push(`directory name: ${name}`);
  }

  // mode
  let mode: ProjectMode;
  if (overrides.mode !== undefined) {
    mode = overrides.mode;
    detected.push(`mode: ${mode} (--mode)`);
  } else {
    mode = hasPackageJson || hasGemfile ? "existing" : "greenfield";
    detected.push(`mode: ${mode} (${hasPackageJson || hasGemfile ? "manifest detected" : "no manifest found"})`);
  }

  // stack
  let stack: StackId | null = null;
  if (overrides.stack !== undefined) {
    stack = overrides.stack;
    detected.push(`stack: ${stack} (--stack)`);
  } else {
    const deps = new Set([...keyStrings(pkg !== null ? pkg.dependencies : null), ...keyStrings(pkg !== null ? pkg.devDependencies : null)]);
    if (hasGemfile && hasPackageJson) stack = "rails-ts";
    else if (hasGemfile) stack = "rails";
    else if (deps.has("next")) stack = "nextjs";
    else if (hasPackageJson) stack = "node-ts-lib";
    if (stack !== null) detected.push(`stack: ${stack} (inferred)`);
  }

  // quality commands: only prefill checks that can actually run
  const commands: QualityCommand[] = [];
  if ((stack === "rails" || stack === "rails-ts") && hasGemfile) {
    commands.push({ id: "lint", command: ["bundle", "exec", "rubocop"] });
    commands.push({ id: "unit", command: ["bundle", "exec", "rspec"] });
    detected.push("quality: lint (bundle exec rubocop), unit (bundle exec rspec)");
  }
  if (stack === "nextjs" || stack === "node-ts-lib" || stack === "rails-ts") {
    if (pkg !== null) {
      const scripts = keyStrings(pkg.scripts);
      const bundleOwned = stack === "rails-ts"; // lint/unit come from bundler there
      const candidates: Array<{ id: string; script: string }> = [
        { id: "typecheck", script: "typecheck" },
        { id: "lint", script: "lint" },
        { id: "unit", script: "test" },
        { id: "build", script: "build" },
      ];
      const npmCommands: QualityCommand[] = [];
      for (const c of candidates) {
        if (bundleOwned && (c.id === "lint" || c.id === "unit")) continue;
        // only prefill checks whose npm script exists in this project
        if (scripts.has(c.script)) {
          npmCommands.push({ id: c.id, command: ["npm", "run", c.script] });
        } else if (c.id === "unit" && scripts.has("unit")) {
          npmCommands.push({ id: "unit", command: ["npm", "run", "unit"] });
        }
      }
      commands.push(...npmCommands);
      detected.push(
        `quality: ${
          npmCommands.length > 0 ? npmCommands.map((c) => c.id).join(", ") : "no runnable npm scripts found"
        } (only scripts present in package.json)`
      );
    }
  }

  return { name, mode, stack, commands, detected };
}

/** Build the plain (YAML-shaped) profile object for serialization. */
export function buildProfileValue(discovery: Discovery): YamlMap {
  const profile: YamlMap = {
    version: 1,
    project: { name: discovery.name, mode: discovery.mode },
  };
  if (discovery.stack === "rails") {
    profile.stack = { backend: { language: "ruby", framework: "rails" } };
  } else if (discovery.stack === "rails-ts") {
    profile.stack = {
      backend: { language: "ruby", framework: "rails" },
      frontend: { language: "typescript" },
    };
  } else if (discovery.stack === "nextjs") {
    profile.stack = { frontend: { language: "typescript", framework: "next" } };
  } else if (discovery.stack === "node-ts-lib") {
    profile.stack = { backend: { language: "typescript" } };
  }
  const quality: YamlMap = {
    timeoutSeconds: 600,
    stopOnFailure: true,
  };
  if (discovery.commands.length > 0) {
    const commands: YamlMap = {};
    for (const c of discovery.commands) {
      commands[c.id] = c.command;
    }
    quality.commands = commands;
  }
  profile.quality = quality;
  profile.policies = {
    tdd: "optional",
    approvals: { migrations: "required", deployment: "required", forcePush: "prohibited" },
  };
  profile.guard = {
    protectedPaths: [".github/workflows/**", ".git/**", ".env", ".env.*", "*.pem", "*.key"],
  };
  profile.router = { enabled: false };
  profile.observer = { enabled: true };
  return profile;
}

export interface InitResult {
  exitCode: number;
  status: "created" | "exists";
  profilePath: string | null;
  directories: string[];
  discovery: Discovery | null;
  profile: ProjectProfile | null;
}

/** Core init logic (shared with `kit scaffold profile`); does not print. */
export function initProfile(
  root: string,
  opts: { mode?: ProjectMode; stack?: StackId; force: boolean }
): InitResult {
  const file = profileFilePath(root);
  if (fs.existsSync(file) && !opts.force) {
    return { exitCode: 1, status: "exists", profilePath: file, directories: [], discovery: null, profile: null };
  }
  const discovery = discoverProject(root, { mode: opts.mode, stack: opts.stack });
  const value = buildProfileValue(discovery);
  fs.mkdirSync(path.join(root, ".ai"), { recursive: true });
  fs.writeFileSync(file, serializeProfile(value), "utf8");
  return { exitCode: 0, status: "created", profilePath: file, directories: [], discovery, profile: null };
}

/** Create the standardized directory skeleton with .gitkeep files. */
export function createKitDirs(root: string): string[] {
  const created: string[] = [];
  for (const rel of KIT_DIRS) {
    const dir = path.join(root, rel);
    fs.mkdirSync(dir, { recursive: true });
    const keep = path.join(dir, ".gitkeep");
    if (!fs.existsSync(keep)) {
      fs.writeFileSync(keep, "", "utf8");
      created.push(rel);
    }
  }
  return created;
}

export function runInit(
  root: string,
  opts: { mode?: string; stack?: string; force: boolean; json: boolean; io: IO }
): { exitCode: number; result: InitResult } {
  const io = opts.io;

  if (opts.mode !== undefined && !MODES.includes(opts.mode as ProjectMode)) {
    io.err(`kit init: invalid --mode "${opts.mode}" (allowed: ${MODES.join(", ")})`);
    return { exitCode: 2, result: { exitCode: 2, status: "exists", profilePath: null, directories: [], discovery: null, profile: null } };
  }
  if (opts.stack !== undefined && !STACK_IDS.includes(opts.stack as StackId)) {
    io.err(`kit init: invalid --stack "${opts.stack}" (allowed: ${STACK_IDS.join(", ")})`);
    return { exitCode: 2, result: { exitCode: 2, status: "exists", profilePath: null, directories: [], discovery: null, profile: null } };
  }

  const result = initProfile(root, {
    mode: opts.mode as ProjectMode | undefined,
    stack: opts.stack as StackId | undefined,
    force: opts.force,
  });

  if (result.exitCode === 1) {
    io.err(`kit init: ${".ai/project.yml"} already exists — use --force to overwrite`);
    return { exitCode: 1, result };
  }

  const dirs = createKitDirs(root);

  if (opts.json) {
    io.out(
      JSON.stringify(
        {
          status: "created",
          profile: ".ai/project.yml",
          directories: KIT_DIRS,
          created: dirs,
          discovery: result.discovery,
        },
        null,
        2
      )
    );
  } else {
    io.out("kit init — project profile");
    io.out("");
    io.out(`  Discovered:`);
    for (const line of result.discovery !== null ? result.discovery.detected : []) {
      io.out(`    - ${line}`);
    }
    io.out("");
    io.out(`  Wrote .ai/project.yml`);
    io.out(`  Directory skeleton ready (${KIT_DIRS.length} standard locations)`);
    io.out("");
    io.out("Next:");
    io.out("  kit verify       # run the configured quality gates");
    io.out("  kit doctor       # check the environment");
  }
  return { exitCode: 0, result: { ...result, directories: dirs } };
}
