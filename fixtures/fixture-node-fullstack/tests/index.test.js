// fixture-node-fullstack/tests/index.test.js
//
// A passing test. Uses Node's built-in test runner so the fixture has no
// dev dependencies — `kit inspect` can run without `npm install`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/index.js';

test('GET / returns 200 with a greeting', async () => {
  const app = createApp();
  const port = await new Promise((resolve) => {
    app.listen(0, () => resolve(app.address().port));
  });
  try {
    const res = await fetch(`http://localhost:${port}/`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.message, 'hello from fixture-node-fullstack');
  } finally {
    app.close();
  }
});

test('GET /health returns 200 ok', async () => {
  const app = createApp();
  const port = await new Promise((resolve) => {
    app.listen(0, () => resolve(app.address().port));
  });
  try {
    const res = await fetch(`http://localhost:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  } finally {
    app.close();
  }
});

test('GET /unknown returns 404', async () => {
  const app = createApp();
  const port = await new Promise((resolve) => {
    app.listen(0, () => resolve(app.address().port));
  });
  try {
    const res = await fetch(`http://localhost:${port}/unknown`);
    assert.equal(res.status, 404);
  } finally {
    app.close();
  }
});
