// tools/ci-agent/test/llm.test.ts
//
// Offline tests for the single LLM seam: a mocked fetch stands in for
// Ollama Cloud, so no test in this file touches the real service
// (README invariant 3: parse/validation failures must fail closed).

import { assert, assertEqual, assertThrows, type Registrar } from './harness.js';
import { LlmError, listCloudModels, resolveModel, structuredChat } from '../src/llm.js';
import { z } from 'zod';

const Reply = z.object({ ok: z.boolean(), note: z.string() });

const VALID_BODY = JSON.stringify({
  model: 'test-model',
  created_at: new Date().toISOString(),
  message: { role: 'assistant', content: '{"ok":true,"note":"structured reply"}' },
  done: true,
});

const TAGS_BODY = JSON.stringify({
  models: [{ name: 'glm-5.3-flash:cloud' }, { name: 'qwen3:cloud' }],
});

function fakeFetch(body: string, status = 200): typeof globalThis.fetch {
  const impl = async () =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } });
  return impl as unknown as typeof globalThis.fetch;
}

const OPTIONS = { apiKey: 'test-key', model: 'test-model' };

export function register(t: Registrar): void {
  t('llm: resolveModel falls back to the default tag', () => {
    assertEqual(resolveModel(undefined), 'glm-5.3-flash:cloud', 'undefined → default');
    assertEqual(resolveModel('   '), 'glm-5.3-flash:cloud', 'blank → default');
    assertEqual(resolveModel('other:cloud'), 'other:cloud', 'explicit wins');
  });

  t('llm: structuredChat returns a schema-validated payload', async () => {
    const result = await structuredChat(
      [{ role: 'user', content: 'say ok' }],
      Reply,
      { ...OPTIONS, fetch: fakeFetch(VALID_BODY) },
    );
    assertEqual(result.ok, true, 'payload parsed');
    assertEqual(result.note, 'structured reply', 'payload content');
  });

  t('llm: unparsable output fails closed with LlmError', async () => {
    await structuredChat(
      [{ role: 'user', content: 'say ok' }],
      Reply,
      { ...OPTIONS, fetch: fakeFetch(JSON.stringify({ model: 'm', message: { role: 'assistant', content: 'this is prose, not JSON' }, done: true })) },
    ).then(
      () => assert(false, 'expected LlmError, got a result'),
      (err) => {
        assert(err instanceof LlmError, `expected LlmError, got ${String(err)}`);
      },
    );
  });

  t('llm: schema-violating output fails closed with LlmError', async () => {
    await structuredChat(
      [{ role: 'user', content: 'say ok' }],
      Reply,
      { ...OPTIONS, fetch: fakeFetch(JSON.stringify({ model: 'm', message: { role: 'assistant', content: '{"ok":"yes-string-not-boolean"}' }, done: true })) },
    ).then(
      () => assert(false, 'expected LlmError, got a result'),
      (err) => {
        assert(err instanceof LlmError, `expected LlmError, got ${String(err)}`);
      },
    );
  });

  t('llm: transport failure (HTTP 500) fails closed with LlmError', async () => {
    await structuredChat([{ role: 'user', content: 'say ok' }], Reply, {
      ...OPTIONS,
      fetch: fakeFetch('{"error":"boom"}', 500),
    }).then(
      () => assert(false, 'expected LlmError, got a result'),
      (err) => {
        assert(err instanceof LlmError, `expected LlmError, got ${String(err)}`);
      },
    );
  });

  t('llm: structuredChat sends the Bearer auth header to the transport', async () => {
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const capture = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), init: init ?? {} });
      return new Response(VALID_BODY, { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof globalThis.fetch;
    const result = await structuredChat([{ role: 'user', content: 'say ok' }], Reply, {
      apiKey: 'secret-key',
      model: 'test-model',
      fetch: capture,
    });
    assertEqual(result.ok, true, 'call succeeded');
    const headers = seen[0]?.init.headers ?? {};
    const serialized = headers instanceof Headers ? headers.get('authorization') ?? '' : JSON.stringify(headers);
    assert(serialized.includes('Bearer secret-key'), 'Authorization Bearer header forwarded');
  });

  t('llm: listCloudModels parses the model tag list (probe gate 1)', async () => {
    const tags = await listCloudModels({ ...OPTIONS, fetch: fakeFetch(TAGS_BODY) });
    assertEqual(tags.length, 2, 'two tags returned');
    assertEqual(tags[0], 'glm-5.3-flash:cloud', 'tag name parsed');
    assertEqual(tags[1], 'qwen3:cloud', 'tag name parsed');
  });

  t('llm: assertThrows still guards synchronous misuse', () => {
    assertThrows(() => {
      throw new LlmError('direct');
    }, 'direct');
  });
}
