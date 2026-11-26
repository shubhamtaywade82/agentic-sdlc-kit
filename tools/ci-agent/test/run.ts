// tools/ci-agent/test/run.ts
//
// Sequential runner for the agent's OFFLINE unit suite
// (package.json: npm test → tsx test/run.ts). Every test mocks its
// transport (fetch) — nothing in this suite calls Ollama Cloud or the
// GitHub API (README "Developing the agent").

import { registered, test, type Registrar } from './harness.js';
import { register as diffParserTests } from './diff-parser.test.js';
import { register as editPolicyTests } from './edit-policy.test.js';
import { register as githubTests } from './github.test.js';
import { register as llmTests } from './llm.test.js';
import { register as logMinimizerTests } from './log-minimizer.test.js';
import { register as schemasTests } from './schemas.test.js';
import { register as securityGuardTests } from './security-guards.test.js';

const modules: readonly ((t: Registrar) => void)[] = [
  diffParserTests,
  logMinimizerTests,
  schemasTests,
  securityGuardTests,
  editPolicyTests,
  llmTests,
  githubTests,
];

for (const register of modules) register(test);

let passed = 0;
let failed = 0;

for (const testCase of registered()) {
  try {
    await testCase.fn();
    passed++;
    console.log(`ok   ${testCase.name}`);
  } catch (err) {
    failed++;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAIL ${testCase.name}`);
    console.error(`     ${message}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed (${passed + failed} total)`);
process.exit(failed === 0 ? 0 : 1);
