// tools/ci-agent/src/github.ts
//
// Minimal GitHub REST client: only what the two agents need, all fail-closed
// on non-2xx. Uses global fetch. The write token comes from CI_AGENT_TOKEN
// (GitHub App installation token minted by the workflow, preferred) falling
// back to GITHUB_TOKEN; reads accept the same resolution.

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'GitHubError';
  }
}

export interface RepoContext {
  readonly owner: string;
  readonly repo: string;
}

export function repoContext(): RepoContext {
  const raw = process.env.GITHUB_REPOSITORY ?? '';
  const parts = raw.split('/');
  const owner = parts[0] ?? '';
  const repo = parts[1] ?? '';
  if (owner === '' || repo === '') {
    throw new GitHubError('GITHUB_REPOSITORY is not set to "owner/name"', 0);
  }
  return { owner, repo };
}

/** CI_AGENT_TOKEN (App token) wins when present; GITHUB_TOKEN otherwise. */
export function authToken(): string {
  for (const name of ['CI_AGENT_TOKEN', 'GITHUB_TOKEN'] as const) {
    const value = process.env[name] ?? '';
    if (value !== '') return value;
  }
  throw new GitHubError('neither CI_AGENT_TOKEN nor GITHUB_TOKEN is set', 0);
}

/** Resolved per request so tests (and runners) can override it late. */
function apiBase(): string {
  return process.env.GITHUB_API_URL ?? 'https://api.github.com';
}

type Transport = (url: string, init: RequestInit) => Promise<Response>;

let transport: Transport = (url, init) => globalThis.fetch(url, init);

/** Replace the transport (offline unit tests only). */
export function setTransport(next: Transport | null): void {
  transport = next ?? ((url, init) => globalThis.fetch(url, init));
}

async function ghFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith('http') ? path : `${apiBase()}${path}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${authToken()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'agentic-sdlc-kit-ci-agent',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  const res = await transport(url, { ...init, headers });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 400);
    } catch {
      // body unreadable — the status code is enough
    }
    throw new GitHubError(
      `${init.method ?? 'GET'} ${path} failed (${res.status}): ${detail}`,
      res.status,
    );
  }
  return res;
}

async function ghJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await ghFetch(path, init);
  const text = await res.text();
  return (text === '' ? {} : JSON.parse(text)) as T;
}

function repoPath(): string {
  const { owner, repo } = repoContext();
  return `/repos/${owner}/${repo}`;
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

export interface PullRequestHead {
  readonly ref: string;
  readonly sha: string;
  readonly repo?: { readonly full_name: string };
}

export interface PullRequest {
  readonly number: number;
  readonly title: string;
  readonly state: string;
  readonly draft: boolean;
  readonly body: string | null;
  readonly base: { readonly ref: string };
  readonly head: PullRequestHead;
}

export async function getPullRequest(n: number): Promise<PullRequest> {
  return ghJson<PullRequest>(`${repoPath()}/pulls/${n}`);
}

export async function getPullRequestDiff(n: number): Promise<string> {
  const res = await ghFetch(`${repoPath()}/pulls/${n}`, {
    headers: { Accept: 'application/vnd.github.diff+json' },
  });
  return res.text();
}

export async function listOpenPullRequests(base: string): Promise<readonly PullRequest[]> {
  return ghJson<readonly PullRequest[]>(
    `${repoPath()}/pulls?state=open&base=${encodeURIComponent(base)}&per_page=100`,
  );
}

export interface InlineReviewComment {
  readonly path: string;
  readonly line: number;
  readonly body: string;
}

/** Post exactly one advisory COMMENT review (never APPROVE/REQUEST_CHANGES). */
export async function createCommentReview(
  n: number,
  body: string,
  comments: readonly InlineReviewComment[],
  commitId: string,
): Promise<void> {
  await ghJson(`${repoPath()}/pulls/${n}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      commit_id: commitId,
      body,
      event: 'COMMENT',
      comments: comments.map((c) => ({ path: c.path, line: c.line, side: 'RIGHT', body: c.body })),
    }),
  });
}

export async function createDraftPullRequest(
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<{ readonly number: number }> {
  return ghJson<{ number: number }>(`${repoPath()}/pulls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, head, base, body, draft: true, maintainer_can_modify: false }),
  });
}

// ---------------------------------------------------------------------------
// Actions run introspection
// ---------------------------------------------------------------------------

export interface WorkflowRun {
  readonly id: number;
  readonly name: string;
  readonly status: string;
  readonly conclusion: string | null;
  readonly head_branch: string | null;
  readonly head_sha: string;
  readonly head_repository: { readonly full_name: string };
}

export async function getWorkflowRun(runId: number): Promise<WorkflowRun> {
  return ghJson<WorkflowRun>(`${repoPath()}/actions/runs/${runId}`);
}

export interface WorkflowJob {
  readonly id: number;
  readonly name: string;
  readonly conclusion: string | null;
  readonly html_url: string;
}

export async function listJobsForWorkflowRun(runId: number): Promise<readonly WorkflowJob[]> {
  const data = await ghJson<{ jobs: readonly WorkflowJob[] }>(
    `${repoPath()}/actions/runs/${runId}/jobs?per_page=100`,
  );
  return data.jobs;
}

/** Job logs (the endpoint 302s to a signed URL; fetch follows redirects). */
export async function downloadJobLogs(jobId: number): Promise<string> {
  const res = await ghFetch(`${repoPath()}/actions/jobs/${jobId}/logs`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Contents & git data (autofix tree edits — never a local checkout)
// ---------------------------------------------------------------------------

export async function fetchFileContents(path: string, ref: string): Promise<string | null> {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  let res: Response;
  try {
    res = await ghFetch(`${repoPath()}/contents/${encoded}?ref=${encodeURIComponent(ref)}`);
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (data.content === undefined || data.encoding !== 'base64') {
    throw new GitHubError(`unexpected contents payload for ${path}`, 0);
  }
  return Buffer.from(data.content, 'base64').toString('utf8');
}

export interface GitCommit {
  readonly sha: string;
  readonly tree: { readonly sha: string };
}

export async function getGitCommit(sha: string): Promise<GitCommit> {
  return ghJson<GitCommit>(`${repoPath()}/git/commits/${sha}`);
}

export async function createBlob(content: string): Promise<string> {
  const data = await ghJson<{ sha: string }>(`${repoPath()}/git/blobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, encoding: 'utf-8' }),
  });
  return data.sha;
}

export interface TreeEntry {
  readonly path: string;
  readonly mode: '100644';
  readonly type: 'blob';
  readonly sha: string;
}

export async function createTree(
  baseTreeSha: string,
  entries: readonly TreeEntry[],
): Promise<string> {
  const data = await ghJson<{ sha: string }>(`${repoPath()}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: entries }),
  });
  return data.sha;
}

export async function createCommit(
  message: string,
  treeSha: string,
  parents: readonly string[],
): Promise<string> {
  const data = await ghJson<{ sha: string }>(`${repoPath()}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: treeSha, parents }),
  });
  return data.sha;
}

/** Creates refs/heads/<branch>; a 422 means the ref already exists. */
export async function createBranchRef(branch: string, sha: string): Promise<void> {
  await ghJson(`${repoPath()}/git/refs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
  });
}
