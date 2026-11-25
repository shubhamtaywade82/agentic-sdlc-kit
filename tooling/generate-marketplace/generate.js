// Generates .claude-plugin/marketplace.json from the plugin and mod manifests.
//
// Merge semantics: entries already present in the committed marketplace.json are
// preserved verbatim (owner-curated order and descriptions); entries discovered
// on disk but missing from the file are appended (plugins first, then mods, each
// sorted by name); entries whose source directory no longer exists are dropped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const MARKETPLACE = path.join(ROOT, '.claude-plugin', 'marketplace.json');

function discover(dir) {
  const base = path.join(ROOT, dir);
  if (!fs.existsSync(base)) return [];
  const found = [];
  for (const id of fs.readdirSync(base).sort()) {
    const manifest = path.join(base, id, '.claude-plugin', 'plugin.json');
    if (!fs.existsSync(manifest)) continue;
    const plugin = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    found.push({
      name: (plugin.name || id).replace(/^agentic-mods\//, ''),
      source: `./${dir}/${id}`,
      description: plugin.description || '',
    });
  }
  return found;
}

const existing = fs.existsSync(MARKETPLACE)
  ? JSON.parse(fs.readFileSync(MARKETPLACE, 'utf8'))
  : { name: 'agentic-sdlc-kit', owner: { name: 'shubhamtaywade82' }, plugins: [] };

const existingEntries = existing.plugins.filter((entry) =>
  fs.existsSync(path.join(ROOT, entry.source)),
);
const known = new Set(existingEntries.map((entry) => entry.source));
const appended = [...discover('plugins'), ...discover('mods')].filter(
  (entry) => !known.has(entry.source),
);
const plugins = [...existingEntries, ...appended];

const marketplace = {
  name: existing.name,
  owner: existing.owner,
  ...(existing.description ? { description: existing.description } : {}),
  plugins,
};

fs.writeFileSync(MARKETPLACE, JSON.stringify(marketplace, null, 2) + '\n');
console.log(`marketplace.json regenerated: ${plugins.length} entries`);
