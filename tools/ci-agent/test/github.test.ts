// tools/ci-agent/test/github.test.ts
//
// Offline tests for the GitHub REST client: a swapped-in transport stands
// in for api.github.com, so nothing here performs network I/O. Covers the
// invariant-2 guarantee that reviews are posted as COMMENT events only.

import { assert, assertEqual, assertThrows, withEnv, type Registrar } from './harness.js';
import {
  authToken,
  createCommentReview,
  fetchFileContents,
  getPullRequest,
  repoContext,
  setTransport,
} from '../src/github.js';

type CapturedInit = { url: string; init: RequestInit };

function captureTransport(status: number, body: string): {
  calls: CapturedInit[];
  transport: (url: string, init: RequestInit) => Promise<Response>;
} {
  const calls: CapturedInit[] = [];
  const transport = async (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    return new Response(body, { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, transport: transport as unknown as (url: string, init: RequestInit) => Promise<Response> };
}

const PR_BODY = JSON.stringify({
  number: 7,
  title: 'fix(cli): harden installer',
  state: 'open',
  draft: false,
  body: 'desc',
  base: { ref: 'main' },
  head: { ref: 'feature', sha: 'abc123', repo: { full_name: 'owner/name' } },
});

export function register(t: Registrar): void {
  t('github: repoContext parses GITHUB_REPOSITORY', async () => {
    await withEnv({ GITHUB_REPOSITORY: 'owner/name' }, () => {
      const ctx = repoContext();
      assertEqual(ctx.owner, 'owner', 'owner parsed');
      assertEqual(ctx.repo, 'name', 'repo parsed');
    });
  });

  t('github: repoContext throws when GITHUB_REPOSITORY is missing', async () => {
    await withEnv({ GITHUB_REPOSITORY: undefined }, () => {
      assertThrows(() => repoContext(), 'GITHUB_REPOSITORY');
    });
  });

  t('github: authToken prefers CI_AGENT_TOKEN over GITHUB_TOKEN', async () => {
    await withEnv({ CI_AGENT_TOKEN: 'app-token', GITHUB_TOKEN: 'gh-token' }, () => {
      assertEqual(authToken(), 'app-token', 'App token wins');
    });
  });

  t('github: authToken falls back to GITHUB_TOKEN, throws when both absent', async () => {
    await withEnv({ CI_AGENT_TOKEN: undefined, GITHUB_TOKEN: 'gh-token' }, () => {
      assertEqual(authToken(), 'gh-token', 'fallback used');
    });
    await withEnv({ CI_AGENT_TOKEN: undefined, GITHUB_TOKEN: undefined }, () => {
      assertThrows(() => authToken(), 'neither CI_AGENT_TOKEN nor GITHUB_TOKEN');
    });
  });

  t('github: getPullRequest hits the pulls endpoint and parses the PR', async () => {
    const { calls, transport } = captureTransport(200, PR_BODY);
    setTransport(transport);
    try {
      await withEnv({ GITHUB_REPOSITORY: 'owner/name', GITHUB_TOKEN: 't' }, async () => {
        const pr = await getPullRequest(7);
        assertEqual(pr.number, 7, 'pr number parsed');
        assertEqual(pr.head.sha, 'abc123', 'head sha parsed');
        assert(calls[0]?.url.includes('/repos/owner/name/pulls/7') ?? false, 'pulls endpoint called');
        assert(calls[0]?.init.headers !== undefined, 'auth headers attached');
      });
    } finally {
      setTransport(null);
    }
  });

  t('github: fetchFileContents decodes base64 and maps 404 to null', async () => {
    const encoded = Buffer.from('hello world', 'utf8').toString('base64');
    const contentsPayload = JSON.stringify({ content: encoded, encoding: 'base64' });
    const ok = captureTransport(200, contentsPayload);
    setTransport(ok.transport);
    try {
      await withEnv({ GITHUB_REPOSITORY: 'owner/name', GITHUB_TOKEN: 't' }, async () => {
        const text = await fetchFileContents('packages/cli/src/a.ts', 'deadbeef');
        assertEqual(text, 'hello world', 'base64 decoded');
        assert(ok.calls[0]?.url.includes('/contents/packages/cli/src/a.ts') ?? false, 'contents endpoint called');
        assert(ok.calls[0]?.url.includes('ref=deadbeef') ?? false, 'ref parameter forwarded');
      });
    } finally {
      setTransport(null);
    }
    const missing = captureTransport(404, '{"message":"Not Found"}');
    setTransport(missing.transport);
    try {
      await withEnv({ GITHUB_REPOSITORY: 'owner/name', GITHUB_TOKEN: 't' }, async () => {
        const none = await fetchFileContents('packages/cli/src/gone.ts', 'deadbeef');
        assertEqual(none, null, '404 becomes null (deleted file)');
      });
    } finally {
      setTransport(null);
    }
  });

  t('github: createCommentReview posts exactly a COMMENT event (invariant 2)', async () => {
    const { calls, transport } = captureTransport(200, '{"id":1}');
    setTransport(transport);
    try {
      await withEnv({ GITHUB_REPOSITORY: 'owner/name', GITHUB_TOKEN: 't' }, async () => {
        await createCommentReview(
          7,
          'Advisory summary',
          [{ path: 'packages/cli/src/a.ts', line: 3, body: 'finding' }],
          'abc123',
        );
        const init = calls[0]?.init ?? {};
        assertEqual(init.method, 'POST', 'review is created via POST');
        const payload = JSON.parse(String(init.body ?? '{}')) as {
          event?: string;
          commit_id?: string;
          comments?: Array<{ path: string; line: number; side: string; body: string }>;
        };
        assertEqual(payload.event, 'COMMENT', 'never APPROVE, never REQUEST_CHANGES');
        assertEqual(payload.commit_id, 'abc123', 'anchored to the PR head');
        assertEqual(payload.comments?.[0]?.side, 'RIGHT', 'inline comments anchor the right side');
      });
    } finally {
      setTransport(null);
    }
  });

  t('github: non-2xx responses raise GitHubError with the status code', async () => {
    const { transport } = captureTransport(500, '{"message":"boom"}');
    setTransport(transport);
    try {
      await withEnv({ GITHUB_REPOSITORY: 'owner/name', GITHUB_TOKEN: 't' }, async () => {
        await getPullRequest(7).then(
          () => assert(false, 'expected GitHubError'),
          (err) => {
            assert(err instanceof Error && 'status' in err, 'GitHubError shape');
            assertEqual((err as { status: number }).status, 500, 'status carried');
          },
        );
      });
    } finally {
      setTransport(null);
    }
  });
}
