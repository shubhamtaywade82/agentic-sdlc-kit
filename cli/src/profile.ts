/**
 * Project profile (`.ai/project.yml`) schema, validation and loading.
 *
 * The profile is the single source of truth for project-specific quality
 * gates and policies. Validation collects ALL problems and reports them
 * together; unknown keys anywhere are errors (strict schema v1).
 */

import * as fs from "fs";
import * as path from "path";
import { parseYaml, YamlMap, YamlParseError, YamlValue } from "./yaml";
import { Issue } from "./report";

export const PROFILE_PATH = ".ai/project.yml";

export type ProjectMode = "existing" | "greenfield";
export type TddPolicy = "required" | "optional";
export type ApprovalPolicy = "required" | "not-required";

export interface StackComponent {
  language: string;
  framework?: string;
}

export interface QualityCommand {
  id: string;
  /** validated argument array; always run with spawn(file, args, { shell: false }) */
  command: string[];
}

export interface ProjectProfile {
  version: 1;
  project: { name: string; mode: ProjectMode };
  stack?: { backend?: StackComponent; frontend?: StackComponent; database?: StackComponent };
  architecture?: { style: string };
  quality: {
    commands: QualityCommand[];
    timeoutSeconds: number;
    stopOnFailure: boolean;
  };
  policies: {
    tdd: TddPolicy;
    approvals: { migrations: ApprovalPolicy; deployment: ApprovalPolicy; forcePush: "prohibited" };
    protectedPaths: string[];
  };
  guard: { protectedPaths: string[] };
  router: {
    enabled: boolean;
    main?: { model: string };
    agents: Array<{ name: string; model: string; effort?: "low" | "medium" | "high" }>;
  };
  observer: { enabled: boolean };
}

export interface ProfileIssue extends Issue {}

export interface ProfileLoadResult {
  profile: ProjectProfile | null;
  issues: ProfileIssue[];
  /** true when `.ai/project.yml` does not exist at all */
  missing: boolean;
}

export function profileFilePath(root: string): string {
  return path.join(root, PROFILE_PATH);
}

// ---------------------------------------------------------------------------
// Key location (line numbers for errors)
// ---------------------------------------------------------------------------

/**
 * Best-effort map from dotted key path (e.g. `quality.commands.lint`) to the
 * 1-based line where that key appears in the raw YAML text. Used to attach
 * line numbers to schema errors.
 */
export function findKeyLines(text: string): Map<string, number> {
  const result = new Map<string, number>();
  const stack: Array<{ indent: number; key: string }> = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)([A-Za-z0-9_-]+):/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) stack.pop();
    const pathParts = stack.map((s) => s.key).concat(m[2]);
    result.set(pathParts.join("."), i + 1);
    stack.push({ indent, key: m[2] });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Value guards
// ---------------------------------------------------------------------------

function asMap(value: YamlValue | undefined): YamlMap | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) return value;
  return null;
}

function isScalarString(value: YamlValue | undefined): value is string {
  return typeof value === "string";
}

class Collector {
  readonly issues: ProfileIssue[] = [];

  constructor(private readonly file: string, private readonly keyLines: Map<string, number>) {}

  lineFor(keyPath: string): number | undefined {
    return this.keyLines.get(keyPath);
  }

  add(code: string, message: string, keyPath?: string): void {
    this.issues.push({
      file: this.file,
      line: keyPath !== undefined ? this.lineFor(keyPath) : undefined,
      code,
      message,
    });
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function parseProfileText(text: string, file: string): { profile: ProjectProfile | null; issues: ProfileIssue[] } {
  const issues: ProfileIssue[] = [];
  let value: YamlMap;
  try {
    value = parseYaml(text);
  } catch (err) {
    if (err instanceof YamlParseError) {
      issues.push({ file, line: err.line, code: "YAML_PARSE_ERROR", message: `${err.code}: ${err.message}` });
      return { profile: null, issues };
    }
    throw err;
  }
  const c = new Collector(file, findKeyLines(text));
  const profile = validateProfile(value, c);
  return { profile, issues: c.issues };
}

function expectString(value: YamlValue | undefined): string | null {
  return isScalarString(value) ? value : null;
}

function expectBoolean(value: YamlValue | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function expectInt(value: YamlValue | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function expectStringArray(value: YamlValue | undefined, keyPath: string, c: Collector): string[] | null {
  if (!Array.isArray(value)) {
    c.add("TYPE_ERROR", `${keyPath} must be a list of strings (use "- item" lines)`, keyPath);
    return null;
  }
  const out: string[] = [];
  let ok = true;
  for (const item of value) {
    if (typeof item !== "string" || item.trim() === "") {
      c.add("TYPE_ERROR", `${keyPath} contains a non-string or empty item; every item must be a non-empty string`, keyPath);
      ok = false;
    } else {
      out.push(item);
    }
  }
  return ok ? out : null;
}

const MODES: ProjectMode[] = ["existing", "greenfield"];
const TDD_POLICIES: TddPolicy[] = ["required", "optional"];
const APPROVAL_POLICIES: ApprovalPolicy[] = ["required", "not-required"];
const EFFORTS = ["low", "medium", "high"] as const;
const STACK_KEYS = ["backend", "frontend", "database"] as const;

export const GUARD_DEFAULT_PROTECTED_PATHS = [
  ".github/workflows/**",
  ".git/**",
  ".env",
  ".env.*",
  "*.pem",
  "*.key",
];

function validateEnum<T extends string>(value: YamlValue | undefined, allowed: readonly T[]): T | null {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  return null;
}

function validateProfile(value: YamlMap, c: Collector): ProjectProfile | null {
  let fatal = false;

  // --- version (required, must be 1) ---
  if (value.version === undefined) {
    c.add("VERSION_REQUIRED", `version is required and must be 1`);
    fatal = true;
  } else if (value.version !== 1 || typeof value.version !== "number") {
    c.add("VERSION_INVALID", `version must be exactly 1 (found ${JSON.stringify(value.version)})`, "version");
    fatal = true;
  }

  // --- project (required) ---
  let projectName: string | null = null;
  let projectMode: ProjectMode | null = null;
  const projectMap = asMap(value.project);
  if (projectMap === null) {
    c.add("PROJECT_REQUIRED", `project is required and must be a map with name and mode (existing|greenfield)`, "project");
    fatal = true;
  } else {
    for (const key of Object.keys(projectMap)) {
      if (key !== "name" && key !== "mode") {
        c.add("UNKNOWN_KEY", `unknown key "project.${key}" (allowed: name, mode)`, `project.${key}`);
      }
    }
    const name = expectString(projectMap.name);
    if (name === null || name.trim() === "") {
      c.add("PROJECT_NAME_INVALID", `project.name must be a non-empty string`, "project.name");
      fatal = true;
    } else {
      projectName = name;
    }
    const mode = validateEnum<ProjectMode>(projectMap.mode, MODES);
    if (mode === null) {
      c.add("PROJECT_MODE_INVALID", `project.mode must be "existing" or "greenfield" (found ${JSON.stringify(projectMap.mode)})`, "project.mode");
      fatal = true;
    } else {
      projectMode = mode;
    }
  }

  // --- stack (optional) ---
  const stack = validateStack(value.stack, c);

  // --- architecture (optional) ---
  let architecture: ProjectProfile["architecture"] | undefined;
  if (value.architecture !== undefined) {
    const archMap = asMap(value.architecture);
    if (archMap === null) {
      c.add("TYPE_ERROR", `architecture must be a map with a style string`, "architecture");
    } else {
      for (const key of Object.keys(archMap)) {
        if (key !== "style") c.add("UNKNOWN_KEY", `unknown key "architecture.${key}" (allowed: style)`, `architecture.${key}`);
      }
      const style = expectString(archMap.style);
      if (style === null || style.trim() === "") {
        c.add("TYPE_ERROR", `architecture.style must be a non-empty string`, "architecture.style");
      } else {
        architecture = { style };
      }
    }
  }

  // --- quality ---
  const quality = validateQuality(value.quality, c);

  // --- policies ---
  const policies = validatePolicies(value.policies, c);

  // --- guard ---
  const guard = validateGuard(value.guard, c);

  // --- router ---
  const router = validateRouter(value.router, c);

  // --- observer ---
  let observerEnabled = true;
  if (value.observer !== undefined) {
    const obsMap = asMap(value.observer);
    if (obsMap === null) {
      c.add("TYPE_ERROR", `observer must be a map with an enabled boolean`, "observer");
    } else {
      for (const key of Object.keys(obsMap)) {
        if (key !== "enabled") c.add("UNKNOWN_KEY", `unknown key "observer.${key}" (allowed: enabled)`, `observer.${key}`);
      }
      const enabled = expectBoolean(obsMap.enabled);
      if (enabled === null) {
        c.add("TYPE_ERROR", `observer.enabled must be true or false`, "observer.enabled");
      } else {
        observerEnabled = enabled;
      }
    }
  }

  // --- unknown top-level keys ---
  const knownTopLevel = new Set(["version", "project", "stack", "architecture", "quality", "policies", "guard", "router", "observer"]);
  for (const key of Object.keys(value)) {
    if (!knownTopLevel.has(key)) {
      c.add("UNKNOWN_KEY", `unknown top-level key "${key}" (allowed: ${Array.from(knownTopLevel).join(", ")})`, key);
    }
  }

  if (fatal || c.issues.length > 0 || projectName === null || projectMode === null) {
    // Any schema violation blocks a safe profile from being produced.
    return null;
  }

  return {
    version: 1,
    project: { name: projectName, mode: projectMode },
    stack,
    architecture,
    quality,
    policies,
    guard,
    router,
    observer: { enabled: observerEnabled },
  };
}

function validateStack(value: YamlValue | undefined, c: Collector): ProjectProfile["stack"] {
  if (value === undefined) return undefined;
  const stackMap = asMap(value);
  if (stackMap === null) {
    c.add("TYPE_ERROR", `stack must be a map of backend/frontend/database components`, "stack");
    return undefined;
  }
  for (const key of Object.keys(stackMap)) {
    if (!(STACK_KEYS as readonly string[]).includes(key)) {
      c.add("UNKNOWN_KEY", `unknown key "stack.${key}" (allowed: backend, frontend, database)`, `stack.${key}`);
    }
  }
  const result: NonNullable<ProjectProfile["stack"]> = {};
  for (const key of STACK_KEYS) {
    const entry = stackMap[key];
    if (entry === undefined) continue;
    const entryMap = asMap(entry);
    if (entryMap === null) {
      c.add("TYPE_ERROR", `stack.${key} must be a map with language and optional framework`, `stack.${key}`);
      continue;
    }
    for (const sub of Object.keys(entryMap)) {
      if (sub !== "language" && sub !== "framework") {
        c.add("UNKNOWN_KEY", `unknown key "stack.${key}.${sub}" (allowed: language, framework)`, `stack.${key}.${sub}`);
      }
    }
    const language = expectString(entryMap.language);
    if (language === null || language.trim() === "") {
      c.add("TYPE_ERROR", `stack.${key}.language must be a non-empty string`, `stack.${key}.language`);
      continue;
    }
    const frameworkRaw = expectString(entryMap.framework);
    if (entryMap.framework !== undefined && (frameworkRaw === null || frameworkRaw.trim() === "")) {
      c.add("TYPE_ERROR", `stack.${key}.framework must be a non-empty string`, `stack.${key}.framework`);
      continue;
    }
    const component: StackComponent = frameworkRaw !== null ? { language, framework: frameworkRaw } : { language };
    if (key === "backend") result.backend = component;
    else if (key === "frontend") result.frontend = component;
    else result.database = component;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function validateQuality(value: YamlValue | undefined, c: Collector): ProjectProfile["quality"] {
  let timeoutSeconds = 600;
  let stopOnFailure = true;
  let commands: QualityCommand[] = [];
  if (value === undefined) {
    return { commands, timeoutSeconds, stopOnFailure };
  }
  const qMap = asMap(value);
  if (qMap === null) {
    c.add("TYPE_ERROR", `quality must be a map (commands, timeoutSeconds, stopOnFailure)`, "quality");
    return { commands, timeoutSeconds, stopOnFailure };
  }
  for (const key of Object.keys(qMap)) {
    if (key !== "commands" && key !== "timeoutSeconds" && key !== "stopOnFailure") {
      c.add("UNKNOWN_KEY", `unknown key "quality.${key}" (allowed: commands, timeoutSeconds, stopOnFailure)`, `quality.${key}`);
    }
  }
  if (qMap.commands !== undefined) {
    const cmdMap = asMap(qMap.commands);
    if (cmdMap === null) {
      c.add("QUALITY_COMMANDS_INVALID", `quality.commands must be an ordered map of check id to argument array`, "quality.commands");
    } else {
      for (const id of Object.keys(cmdMap)) {
        const entry = cmdMap[id];
        if (typeof entry === "string" || typeof entry === "number" || typeof entry === "boolean") {
          c.add(
            "QUALITY_COMMAND_INVALID",
            `quality.commands.${id} must be an array of strings, not a scalar. Write it as:\n` +
              `    ${id}:\n` +
              `      - npm\n` +
              `      - run\n` +
              `      - ${id}`,
            `quality.commands.${id}`
          );
          continue;
        }
        if (!Array.isArray(entry)) {
          c.add("QUALITY_COMMAND_INVALID", `quality.commands.${id} must be an array of strings`, `quality.commands.${id}`);
          continue;
        }
        const command: string[] = [];
        let ok = true;
        for (const part of entry) {
          if (typeof part !== "string" || part.trim() === "") {
            ok = false;
            c.add(
              "QUALITY_COMMAND_INVALID",
              `quality.commands.${id} must contain only non-empty strings (validated argument arrays are run with shell:false)`,
              `quality.commands.${id}`
            );
            break;
          }
          command.push(part);
        }
        if (ok && command.length === 0) {
          c.add("QUALITY_COMMAND_INVALID", `quality.commands.${id} must not be empty`, `quality.commands.${id}`);
          ok = false;
        }
        if (ok) commands.push({ id, command });
      }
    }
  }
  if (qMap.timeoutSeconds !== undefined) {
    const t = expectInt(qMap.timeoutSeconds);
    if (t === null || t <= 0) {
      c.add("TYPE_ERROR", `quality.timeoutSeconds must be a positive integer (found ${JSON.stringify(qMap.timeoutSeconds)})`, "quality.timeoutSeconds");
    } else {
      timeoutSeconds = t;
    }
  }
  if (qMap.stopOnFailure !== undefined) {
    const s = expectBoolean(qMap.stopOnFailure);
    if (s === null) {
      c.add("TYPE_ERROR", `quality.stopOnFailure must be true or false`, "quality.stopOnFailure");
    } else {
      stopOnFailure = s;
    }
  }
  return { commands, timeoutSeconds, stopOnFailure };
}

function validatePolicies(value: YamlValue | undefined, c: Collector): ProjectProfile["policies"] {
  const result: ProjectProfile["policies"] = {
    tdd: "optional",
    approvals: { migrations: "required", deployment: "required", forcePush: "prohibited" },
    protectedPaths: [],
  };
  if (value === undefined) return result;
  const pMap = asMap(value);
  if (pMap === null) {
    c.add("TYPE_ERROR", `policies must be a map (tdd, approvals, protectedPaths)`, "policies");
    return result;
  }
  for (const key of Object.keys(pMap)) {
    if (key !== "tdd" && key !== "approvals" && key !== "protectedPaths") {
      c.add("UNKNOWN_KEY", `unknown key "policies.${key}" (allowed: tdd, approvals, protectedPaths)`, `policies.${key}`);
    }
  }
  if (pMap.tdd !== undefined) {
    const tdd = validateEnum<TddPolicy>(pMap.tdd, TDD_POLICIES);
    if (tdd === null) {
      c.add("POLICY_INVALID", `policies.tdd must be "required" or "optional" (found ${JSON.stringify(pMap.tdd)})`, "policies.tdd");
    } else {
      result.tdd = tdd;
    }
  }
  if (pMap.approvals !== undefined) {
    const aMap = asMap(pMap.approvals);
    if (aMap === null) {
      c.add("TYPE_ERROR", `policies.approvals must be a map (migrations, deployment, forcePush)`, "policies.approvals");
    } else {
      for (const key of Object.keys(aMap)) {
        if (key !== "migrations" && key !== "deployment" && key !== "forcePush") {
          c.add("UNKNOWN_KEY", `unknown key "policies.approvals.${key}" (allowed: migrations, deployment, forcePush)`, `policies.approvals.${key}`);
        }
      }
      for (const key of ["migrations", "deployment"] as const) {
        if (aMap[key] !== undefined) {
          const pol = validateEnum<ApprovalPolicy>(aMap[key], APPROVAL_POLICIES);
          if (pol === null) {
            c.add("POLICY_INVALID", `policies.approvals.${key} must be "required" or "not-required" (found ${JSON.stringify(aMap[key])})`, `policies.approvals.${key}`);
          } else {
            result.approvals[key] = pol;
          }
        }
      }
      if (aMap.forcePush !== undefined && aMap.forcePush !== "prohibited") {
        c.add("POLICY_FORCE_PUSH_INVALID", `policies.approvals.forcePush must be "prohibited" — any other value is rejected (found ${JSON.stringify(aMap.forcePush)})`, "policies.approvals.forcePush");
      }
    }
  }
  if (pMap.protectedPaths !== undefined) {
    const paths = expectStringArray(pMap.protectedPaths, "policies.protectedPaths", c);
    if (paths !== null) result.protectedPaths = paths;
  }
  return result;
}

function validateGuard(value: YamlValue | undefined, c: Collector): ProjectProfile["guard"] {
  const result: ProjectProfile["guard"] = { protectedPaths: [...GUARD_DEFAULT_PROTECTED_PATHS] };
  if (value === undefined) return result;
  const gMap = asMap(value);
  if (gMap === null) {
    c.add("TYPE_ERROR", `guard must be a map with a protectedPaths list`, "guard");
    return result;
  }
  for (const key of Object.keys(gMap)) {
    if (key !== "protectedPaths") {
      c.add("UNKNOWN_KEY", `unknown key "guard.${key}" (allowed: protectedPaths)`, `guard.${key}`);
    }
  }
  if (gMap.protectedPaths !== undefined) {
    const paths = expectStringArray(gMap.protectedPaths, "guard.protectedPaths", c);
    if (paths !== null) result.protectedPaths = paths;
  }
  return result;
}

function validateRouter(value: YamlValue | undefined, c: Collector): ProjectProfile["router"] {
  const result: ProjectProfile["router"] = { enabled: false, agents: [] };
  if (value === undefined) return result;
  const rMap = asMap(value);
  if (rMap === null) {
    c.add("TYPE_ERROR", `router must be a map (enabled, main, agents)`, "router");
    return result;
  }
  for (const key of Object.keys(rMap)) {
    if (key !== "enabled" && key !== "main" && key !== "agents") {
      c.add("UNKNOWN_KEY", `unknown key "router.${key}" (allowed: enabled, main, agents)`, `router.${key}`);
    }
  }
  if (rMap.enabled !== undefined) {
    const enabled = expectBoolean(rMap.enabled);
    if (enabled === null) {
      c.add("TYPE_ERROR", `router.enabled must be true or false`, "router.enabled");
    } else {
      result.enabled = enabled;
    }
  }
  if (rMap.main !== undefined) {
    const mMap = asMap(rMap.main);
    if (mMap === null) {
      c.add("TYPE_ERROR", `router.main must be a map with a model string`, "router.main");
    } else {
      for (const key of Object.keys(mMap)) {
        if (key !== "model") c.add("UNKNOWN_KEY", `unknown key "router.main.${key}" (allowed: model)`, `router.main.${key}`);
      }
      const model = expectString(mMap.model);
      if (model === null || model.trim() === "") {
        c.add("TYPE_ERROR", `router.main.model must be a non-empty string`, "router.main.model");
      } else {
        result.main = { model };
      }
    }
  }
  if (rMap.agents !== undefined) {
    const agentsMap = asMap(rMap.agents);
    if (agentsMap === null) {
      c.add("TYPE_ERROR", `router.agents must be a map of agent name to { model, effort }`, "router.agents");
    } else {
      for (const name of Object.keys(agentsMap)) {
        const aMap = asMap(agentsMap[name]);
        const keyPath = `router.agents.${name}`;
        if (aMap === null) {
          c.add("TYPE_ERROR", `router.agents.${name} must be a map with model and optional effort`, keyPath);
          continue;
        }
        for (const key of Object.keys(aMap)) {
          if (key !== "model" && key !== "effort") {
            c.add("UNKNOWN_KEY", `unknown key "${key}" in router.agents.${name} (allowed: model, effort)`, `${keyPath}.${key}`);
          }
        }
        const model = expectString(aMap.model);
        if (model === null || model.trim() === "") {
          c.add("TYPE_ERROR", `router.agents.${name}.model must be a non-empty string`, `${keyPath}.model`);
          continue;
        }
        let effort: "low" | "medium" | "high" | undefined;
        if (aMap.effort !== undefined) {
          const e = validateEnum<"low" | "medium" | "high">(aMap.effort, EFFORTS);
          if (e === null) {
            c.add("TYPE_ERROR", `router.agents.${name}.effort must be "low", "medium" or "high"`, `${keyPath}.effort`);
            continue;
          }
          effort = e;
        }
        result.agents.push(effort !== undefined ? { name, model, effort } : { name, model });
      }
    }
  }
  return result;
}

/**
 * Union of policies.protectedPaths and guard.protectedPaths
 * (first occurrence wins, policies first).
 */
export function effectiveProtectedPaths(profile: ProjectProfile): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...profile.policies.protectedPaths, ...profile.guard.protectedPaths]) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function loadProfile(root: string): ProfileLoadResult {
  const file = profileFilePath(root);
  if (!fs.existsSync(file)) {
    return { profile: null, issues: [], missing: true };
  }
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    return {
      profile: null,
      issues: [{ file: PROFILE_PATH, code: "PROFILE_UNREADABLE", message: `could not read ${PROFILE_PATH}: ${String(err)}` }],
      missing: false,
    };
  }
  const { profile, issues } = parseProfileText(text, PROFILE_PATH);
  return { profile, issues, missing: false };
}
