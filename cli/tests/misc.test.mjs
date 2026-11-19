/**
 * doctor / inspect / changed / init tests (light coverage for the
 * environment-facing commands).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  makeTempDir,
  cleanup,
  writeProject,
  silentIO,
  loadDist,
  hasGit,
  initGitRepo,
  gitCommitAll,
} from "./helpers.mjs";

const { runDoctor } = loadDist("doctor");
const { runInspect } = loadDist("inspect");
const { runChanged, classifyPath } = loadDist("changed");
const { runInit, discoverProject, KIT_DIRS } = loadDist("init");

// --- doctor ---

test("doctor reports the required checks", () => {
  const root = makeTempDir("kit-doctor-");
  try {
    const { exitCode, report } = runDoctor(root, { json: false, io: silentIO });
    assert.ok(exitCode === 0 || exitCode === 1);
    const ids = report.checks.map((c) => c.id);
    assert.deepEqual(ids, [
      "node-version",
      "git-present",
      "package-managers",
      "project-detection",
      "kit-integrity",
      "claude-version",
      "mcp-build-state",
    ]);
    const node = report.checks.find((c) => c.id === "node-version");
    assert.equal(node.status, "OK");
    if (hasGit()) {
      assert.equal(report.checks.find((c) => c.id === "git-present").status, "OK");
    }
  } finally {
    cleanup(root);
  }
});

test("doctor --json output matches the report object", () => {
  const root = makeTempDir("kit-doctor-");
  try {
    const lines = [];
    const io = { out: (l) => lines.push(l), err: () => {} };
    const { report } = runDoctor(root, { json: true, io });
    assert.deepEqual(JSON.parse(lines.join("\n")), report);
  } finally {
    cleanup(root);
  }
});

test("doctor: non-empty .ai/manifest is OK, empty is FAIL, missing is INFO", () => {
  const root = makeTempDir("kit-doctor-");
  try {
    writeProject(root, { ".ai/manifest": "file1\nfile2\n" });
    const ok = runDoctor(root, { json: false, io: silentIO });
    assert.equal(ok.report.checks.find((c) => c.id === "kit-integrity").status, "OK");
    assert.equal(ok.exitCode, 0);

    writeProject(root, { ".ai/manifest": "" });
    const empty = runDoctor(root, { json: false, io: silentIO });
    assert.equal(empty.report.checks.find((c) => c.id === "kit-integrity").status, "FAIL");
    assert.equal(empty.exitCode, 1);
  } finally {
    cleanup(root);
  }
});

// --- inspect ---

test("inspect detects manifests, frameworks, test tooling and configs", () => {
  const root = makeTempDir("kit-inspect-");
  try {
    writeProject(root, {
      "package.json": JSON.stringify({
        name: "inspect-app",
        dependencies: { react: "^18.0.0", next: "^14.0.0" },
        devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0" },
        scripts: { test: "vitest" },
      }),
      "src/app.tsx": "export {};\n",
      "tests/app.test.ts": "import {} from 'vitest';\n",
      ".eslintrc.json": "{}\n",
      "tsconfig.json": "{}\n",
      "docs/specifications/features/a.md": "# a\n",
      "docs/plans/b.md": "# b\n",
    });
    const { exitCode, report } = runInspect(root, { json: false, io: silentIO });
    assert.equal(exitCode, 0);
    assert.equal(report.status, "ok");
    assert.equal(report.manifests.packageJson, true);
    assert.equal(report.manifests.projectName, "inspect-app");
    assert.deepEqual(report.frameworks.sort(), ["next", "react"]);
    assert.deepEqual(report.testFrameworks, ["vitest"]);
    assert.ok(report.configs.lint.includes(".eslintrc.json"));
    assert.ok(report.configs.typecheck.includes("tsconfig.json"));
    assert.equal(report.git.repo, false);
    assert.equal(report.kit.profile, false);
    assert.equal(report.kit.specifications, 1);
    assert.equal(report.kit.plans, 1);
    assert.equal(report.kit.adrs, 0);
    const exts = report.files.byExtension.map((e) => e.ext);
    assert.ok(exts.includes("tsx"));
    assert.ok(report.files.byExtension.length <= 8);
  } finally {
    cleanup(root);
  }
});

// --- changed ---

test("classifyPath categories", () => {
  assert.equal(classifyPath("src/foo.ts"), "source");
  assert.equal(classifyPath("lib/foo.mjs"), "source");
  assert.equal(classifyPath("tests/foo.test.ts"), "test");
  assert.equal(classifyPath("spec/models/user_spec.rb"), "test");
  assert.equal(classifyPath("src/__tests__/x.ts"), "test");
  assert.equal(classifyPath("db/migrate/20260101120001_create_users.rb"), "migrations");
  assert.equal(classifyPath("db/migration_tool.py"), "migrations");
  assert.equal(classifyPath("docs/guide.md"), "docs");
  assert.equal(classifyPath("README.md"), "docs");
  assert.equal(classifyPath(".github/workflows/ci.yml"), "config");
  assert.equal(classifyPath(".gitlab-ci.yml"), "config");
  assert.equal(classifyPath("vitest.config.mts"), "config");
  assert.equal(classifyPath(".env.example"), "config");
  assert.equal(classifyPath("Makefile"), "other");
});

test("changed: working tree + base diff classification", { skip: !hasGit() }, () => {
  const base = makeTempDir("kit-changed-");
  const work = makeTempDir("kit-changed-");
  try {
    // base clone on main
    initGitRepo(base);
    writeProject(base, {
      "src/old.ts": "old\n",
      "tests/old.test.ts": "old\n",
      "docs/old.md": "old\n",
    });
    gitCommitAll(base, "base");
    // working clone with a new branch, committed changes and one dirty file
    const cp = spawnSync("git", ["clone", "-q", base, work]);
    assert.equal(cp.status, 0, cp.stderr && cp.stderr.toString());
    const git = (args) => spawnSync("git", args, { cwd: work, encoding: "utf8" });
    git(["config", "user.email", "kit-test@example.invalid"]);
    git(["config", "user.name", "Kit Test"]);
    git(["checkout", "-q", "-b", "feature/x"]);
    writeProject(work, {
      "src/new.ts": "new\n",
      "tests/new.test.ts": "new\n",
      "db/migrate/001_x.rb": "x\n",
      ".github/workflows/ci.yml": "ci\n",
      "Makefile": "make\n",
    });
    git(["add", "-A"]);
    git(["commit", "-qm", "changes"]);
    writeProject(work, { "docs/dirty.md": "dirty\n" }); // uncommitted

    const { exitCode, report } = runChanged(work, { base: "main", json: false, io: silentIO });
    assert.equal(exitCode, 0);
    assert.equal(report.base, "main");
    assert.equal(report.branch, "feature/x");
    assert.ok(report.classification.test.files.includes("tests/new.test.ts"));
    assert.ok(report.classification.migrations.files.includes("db/migrate/001_x.rb"));
    assert.ok(report.classification.config.files.includes(".github/workflows/ci.yml"));
    assert.ok(report.classification.docs.files.includes("docs/dirty.md"));
    assert.ok(report.classification.source.files.includes("src/new.ts"));
    assert.ok(report.classification.other.files.includes("Makefile"));
    assert.ok(report.affectedAreas.includes("src"));
    assert.ok(report.affectedAreas.includes("tests"));
  } finally {
    cleanup(base);
    cleanup(work);
  }
});

test("changed: not a repo exits 3", () => {
  const root = makeTempDir("kit-changed-");
  try {
    const { exitCode } = runChanged(root, { json: false, io: silentIO });
    assert.equal(exitCode, 3);
  } finally {
    cleanup(root);
  }
});

test("changed: explicit --base that does not exist exits 2", { skip: !hasGit() }, () => {
  const root = makeTempDir("kit-changed-");
  try {
    initGitRepo(root);
    writeProject(root, { "a.txt": "a\n" });
    gitCommitAll(root, "init");
    const { exitCode } = runChanged(root, { base: "no-such-ref", json: false, io: silentIO });
    assert.equal(exitCode, 2);
  } finally {
    cleanup(root);
  }
});

test("changed: master fallback when main does not exist", { skip: !hasGit() }, () => {
  const root = makeTempDir("kit-changed-");
  try {
    initGitRepo(root);
    spawnSync("git", ["branch", "-m", "master"], { cwd: root }); // rename main -> master
    writeProject(root, { "a.txt": "a\n" });
    gitCommitAll(root, "init");
    const { exitCode, report } = runChanged(root, { json: false, io: silentIO });
    assert.equal(exitCode, 0);
    assert.equal(report.base, "master");
  } finally {
    cleanup(root);
  }
});

// --- init ---

test("init refuses to overwrite without --force and creates the skeleton", () => {
  const root = makeTempDir("kit-init-");
  try {
    writeProject(root, {
      "package.json": JSON.stringify({
        name: "init-app",
        version: "0.1.0",
        scripts: { typecheck: "tsc --noEmit", lint: "eslint .", test: "node --test", build: "echo ok" },
      }),
    });
    const first = runInit(root, { force: false, json: false, io: silentIO });
    assert.equal(first.exitCode, 0);
    assert.equal(existsSync(join(root, ".ai", "project.yml")), true);
    for (const dir of KIT_DIRS) {
      assert.equal(existsSync(join(root, dir, ".gitkeep")), true, `${dir}/.gitkeep should exist`);
    }
    const profile = readFileSync(join(root, ".ai", "project.yml"), "utf8");
    assert.match(profile, /name: init-app/);
    assert.match(profile, /mode: existing/);
    assert.match(profile, /- npm\n      - run\n      - typecheck/);
    assert.match(profile, /- npm\n      - run\n      - test/);

    const refused = runInit(root, { force: false, json: false, io: silentIO });
    assert.equal(refused.exitCode, 1);

    const forced = runInit(root, { force: true, json: false, io: silentIO });
    assert.equal(forced.exitCode, 0);
  } finally {
    cleanup(root);
  }
});

test("init discovery prefills only scripts that exist", () => {
  const root = makeTempDir("kit-init-");
  try {
    writeProject(root, {
      "package.json": JSON.stringify({ name: "sparse", version: "1.0.0", scripts: { build: "echo b" } }),
    });
    const d = discoverProject(root, {});
    assert.deepEqual(
      d.commands.map((c) => c.id),
      ["build"]
    );
    assert.equal(d.mode, "existing");
  } finally {
    cleanup(root);
  }
});

test("init discovery for a rails project uses bundle exec", () => {
  const root = makeTempDir("kit-init-");
  try {
    writeProject(root, { "Gemfile": "source 'https://rubygems.org'\n" });
    const d = discoverProject(root, {});
    assert.equal(d.stack, "rails");
    assert.deepEqual(
      d.commands.map((c) => [c.id, c.command]),
      [
        ["lint", ["bundle", "exec", "rubocop"]],
        ["unit", ["bundle", "exec", "rspec"]],
      ]
    );
    assert.equal(d.mode, "existing");
  } finally {
    cleanup(root);
  }
});

test("init discovery for a rails-ts project mixes bundle and npm gates", () => {
  const root = makeTempDir("kit-init-");
  try {
    writeProject(root, {
      "Gemfile": "source 'https://rubygems.org'\n",
      "package.json": JSON.stringify({
        name: "mono-app",
        version: "1.0.0",
        scripts: { typecheck: "tsc --noEmit", build: "next build", test: "vitest" },
      }),
    });
    const d = discoverProject(root, {});
    assert.equal(d.stack, "rails-ts");
    assert.deepEqual(
      d.commands.map((c) => [c.id, c.command]),
      [
        ["lint", ["bundle", "exec", "rubocop"]],
        ["unit", ["bundle", "exec", "rspec"]],
        ["typecheck", ["npm", "run", "typecheck"]],
        ["build", ["npm", "run", "build"]],
      ]
    );
  } finally {
    cleanup(root);
  }
});

test("init discovery for a greenfield project", () => {
  const root = makeTempDir("kit-init-");
  try {
    const d = discoverProject(root, {});
    assert.equal(d.stack, null);
    assert.equal(d.mode, "greenfield");
    assert.deepEqual(d.commands, []);
  } finally {
    cleanup(root);
  }
});

test("init with invalid --mode/--stack exits 2", () => {
  const root = makeTempDir("kit-init-");
  try {
    assert.equal(runInit(root, { mode: "sideways", force: false, json: false, io: silentIO }).exitCode, 2);
    assert.equal(runInit(root, { stack: "django", force: false, json: false, io: silentIO }).exitCode, 2);
  } finally {
    cleanup(root);
  }
});
