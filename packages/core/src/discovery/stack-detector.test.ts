// packages/core/src/discovery/stack-detector.test.ts
//
// Regression tests for evidence-based detection: labels must come from
// real markers, not from the mere existence of a language's manifest.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectStacks } from './stack-detector.js';

async function withTmp(files: Record<string, string>): Promise<string> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kit-stack-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(tmp, rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content, 'utf8');
  }
  return tmp;
}

describe('detectStacks (ruby)', () => {
  it('labels a plain Ruby project as ruby, NOT ruby-rails', async () => {
    const tmp = await withTmp({ Gemfile: 'source "https://rubygems.org"\ngem "rspec"\n' });
    try {
      const r = await detectStacks(tmp);
      expect(r.detectedStacks).toContain('ruby');
      expect(r.detectedStacks).not.toContain('ruby-rails');
      expect(r.packageManagers).toContain('bundler');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('labels a Rails project as ruby-rails (config/application.rb evidence)', async () => {
    const tmp = await withTmp({
      Gemfile: 'source "https://rubygems.org"\ngem "rails", "~> 7.0"\n',
      'config/application.rb': 'module MyApp; class Application < Rails::Application; end; end\n',
    });
    try {
      const r = await detectStacks(tmp);
      expect(r.detectedStacks).toContain('ruby-rails');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('labels a project with only a rails gem in the Gemfile as ruby-rails', async () => {
    const tmp = await withTmp({
      Gemfile: 'source "https://rubygems.org"\ngem "rails", "~> 7.0"\n',
    });
    try {
      const r = await detectStacks(tmp);
      expect(r.detectedStacks).toContain('ruby-rails');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});

describe('detectStacks (python)', () => {
  it('does NOT report pytest for a project with no pytest evidence', async () => {
    const tmp = await withTmp({
      'pyproject.toml': '[project]\nname = "x"\nversion = "0.1.0"\n',
    });
    try {
      const r = await detectStacks(tmp);
      expect(r.detectedStacks).toContain('python');
      expect(r.testFrameworks).not.toContain('pytest');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('reports pytest when requirements.txt mentions it', async () => {
    const tmp = await withTmp({ 'requirements.txt': 'flask==3.0.0\npytest==8.0.0\n' });
    try {
      const r = await detectStacks(tmp);
      expect(r.testFrameworks).toContain('pytest');
      expect(r.packageManagers).toContain('pip');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it('reports poetry as the package manager for a poetry project', async () => {
    const tmp = await withTmp({
      'pyproject.toml': '[tool.poetry]\nname = "x"\nversion = "0.1.0"\n',
    });
    try {
      const r = await detectStacks(tmp);
      expect(r.packageManagers).toContain('poetry');
      expect(r.packageManagers).not.toContain('pip');
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });
});
