// Validates that every marketplace entry has a plugin manifest. New mods/* must
// declare the agenticMods capability manifest (hooks, capabilities, claudeCode
// baseline); legacy plugins/* entries only warn until they adopt it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const errors = [];
const warnings = [];

for (const dir of ['mods', 'plugins']) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) continue;
  for (const id of fs.readdirSync(base)) {
    const label = `${dir}/${id}`;
    const manifest = path.join(base, id, '.claude-plugin', 'plugin.json');
    if (!fs.existsSync(manifest)) {
      errors.push(`${label} (missing .claude-plugin/plugin.json)`);
      continue;
    }
    const plugin = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const hasCapabilityDeclaration = Boolean(plugin.agenticMods && plugin.agenticMods.claudeCode);
    if (!hasCapabilityDeclaration && dir === 'mods') {
      errors.push(`${label} (no agenticMods capability declaration)`);
    } else if (!hasCapabilityDeclaration) {
      warnings.push(`${label} (legacy plugin without agenticMods capability declaration)`);
    }
  }
}

if (warnings.length > 0) {
  console.warn('Warnings:\n' + warnings.map((w) => `  - ${w}`).join('\n'));
}
if (errors.length > 0) {
  console.error('Invalid mod entries:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log('All marketplace entries valid.');
