// claude plugin test — run with `claude plugin test` from this mod directory.
// Thin write-path integration tests; the canonical pattern list is covered in
// runtime-tests/secret.spec.ts.

import { expect, test } from 'claude-code/testing';

const ghToken = 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';

test('blocks writing a GitHub token', async ($, on) => {
  const r = await $.tool.call({
    tool: 'Write',
    file_path: 'scripts/deploy.sh',
    content: 'export GITHUB_TOKEN=' + ghToken + '\n',
  });
  expect(r.deny).toContain('secret-guard');
});

test('blocks writing a private key block', async ($, on) => {
  const pem = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');
  const r = await $.tool.call({
    tool: 'Write',
    file_path: 'certs/server.key',
    content: pem + '\nMIIE...\n',
  });
  expect(r.deny).toContain('private-key-block');
});

test('allows clean writes', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }));
  const r = await $.tool.call({
    tool: 'Write',
    file_path: 'src/config.ts',
    content: 'export const retries = 3;\n',
  });
  expect(r.result).toBe('ok');
});

test('refuses production env files without approval', async ($, on) => {
  // nobody answers the modal → refuse
  const r = await $.tool.call({
    tool: 'Write',
    file_path: '.env.production',
    content: 'LOG_LEVEL=info\n',
  });
  expect(r.deny).toBeTruthy();
});
