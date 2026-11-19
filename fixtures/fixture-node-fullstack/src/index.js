// fixture-node-fullstack/src/index.js
//
// A minimal but real Node.js + Express-style application. We deliberately
// use plain Node's http module to keep the fixture dependency-free (so the
// kit can inspect it without an `npm install` step).
//
// The fixture is the target of the first M2 `kit inspect` dry-run. It must:
//   - have a passing test (tests/index.test.js)
//   - have a project structure a real scanner can recognize
//   - have an AGENTS.md so discovery can find it
//   - have a .ai-kit/project.yml that matches what `kit init` would produce
//   - NOT contain real secrets (synthetic patterns only)

import { createServer } from 'node:http';

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);

/**
 * The application's only endpoint: returns a JSON greeting. This is real
 * business logic that the kit's tests can exercise.
 */
export function createApp() {
  return createServer((req, res) => {
    if (req.url === '/' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'hello from fixture-node-fullstack' }));
      return;
    }
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });
}

export function start(port = PORT) {
  const app = createApp();
  return app.listen(port);
}

// Run when invoked directly.
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = start();
  console.log(`fixture-node-fullstack listening on http://localhost:${PORT}`);
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}
