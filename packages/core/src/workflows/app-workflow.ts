// packages/core/src/workflows/app-workflow.ts
//
// M8 Greenfield application workflow: scaffolds complete application repository,
// initial architecture ADRs, profile configuration, and first vertical slice.

import { promises as fs } from "node:fs";
import path from "node:path";
import { type ProjectProfile, type Result } from "@agentic-sdlc-kit/contracts";
import { serializeProfileYaml } from "../project-profile/serializer.js";
import { createAdr } from "../planning/adr.js";
import { scaffoldSpecification } from "../specification/scaffolder.js";

export interface GreenfieldAppOptions {
  readonly name: string;
  readonly targetDir: string;
  readonly stack?: string;
}

export interface GreenfieldAppResult {
  readonly name: string;
  readonly appDir: string;
  readonly profilePath: string;
  readonly specPath: string;
  readonly adrPath: string;
}

export async function scaffoldGreenfieldApp(
  opts: GreenfieldAppOptions,
): Promise<Result<GreenfieldAppResult>> {
  const appDir = path.resolve(opts.targetDir, opts.name);
  await fs.mkdir(appDir, { recursive: true });

  // 1. Initial git marker
  const gitDir = path.join(appDir, ".git");
  await fs.mkdir(gitDir, { recursive: true });
  await fs.writeFile(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n", "utf8");

  // 2. .ai-kit/project.yml
  const aiKitDir = path.join(appDir, ".ai-kit");
  await fs.mkdir(aiKitDir, { recursive: true });
  const profile: ProjectProfile = {
    schemaVersion: 1,
    name: opts.name,
    stack: [opts.stack ?? "node-typescript"],
    commands: {
      test: [["npm", "test"]],
      lint: [["npm", "run", "lint"]],
      build: [["npm", "run", "build"]],
    },
  };
  const profilePath = path.join(aiKitDir, "project.yml");
  await fs.writeFile(profilePath, serializeProfileYaml(profile), "utf8");

  // 3. ADR-0001
  const adrDir = path.join(appDir, "docs", "architecture", "adr");
  const adrPath = await createAdr(adrDir, {
    number: 1,
    title: "System Architecture Baseline",
    context: `Greenfield initialization for ${opts.name}`,
    decision: `Adopt modular layered architecture using stack: ${opts.stack ?? "node-typescript"}`,
    consequences: ["Explicit module boundaries", "Automated verification from day zero"],
    status: "accepted",
  });

  // 4. Initial feature specification
  const specDir = path.join(appDir, "docs", "specifications", "features");
  const specPath = await scaffoldSpecification({
    id: "FEATURE-001",
    title: "Core System Baseline",
    targetDir: specDir,
  });

  return {
    ok: true,
    value: { name: opts.name, appDir, profilePath, specPath, adrPath },
  };
}
