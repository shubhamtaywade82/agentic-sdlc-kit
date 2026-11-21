// packages/cli/src/application/agent/providers/claude-code/provider.ts
//
// ClaudeCodeProvider — the secure Claude Code provider for Mode 1
// (kit-orchestrated) execution. ADR-0019 PR4 (security-critical).
//
// What this provider guarantees (and where each guarantee is tested):
//   - HEADLESS: `claude -p --output-format stream-json` with an ARGV ARRAY,
//     shell:false, cwd = the run's isolated workspace (worktree) — never
//     the developer's tree. (provider.test.ts: argv assertions)
//   - POLICY-DERIVED PERMISSIONS: the session's permission configuration is
//     GENERATED from the canonical snapshot (permission-config.ts); no
//     hand-maintained second policy (ADR-0020 §2). `bypassPermissions` and
//     `--dangerously-skip-permissions` are never emitted (asserted at
//     build time in claude-argv.ts and pinned by tests).
//   - MODS PARITY: the kit's runtime Mods are linked into the workspace
//     before the agent starts; the outcome is reported honestly
//     (mod-parity.ts).
//   - HONEST BUDGETS: duration + tool calls are gateway-enforced (the
//     provider wires abort -> kill and streams tool.requested events LIVE
//     so the gateway's counters actually fire mid-run); tokens and cost
//     are reported best-effort from Claude's own usage telemetry — declared
//     best-effort, never provider-enforced (revision C).
//   - HONEST STATUSES: cancellation/crash/turn-limit are VALUES on the
//     result (cancelled/interrupted/failed), never `completed`
//     (provider.test.ts: cancel, crash, max-turns, error, no-result).
//   - CROSS-PROCESS RESUME: the session id + resume token persist ONLY in
//     the AES-256-GCM store (resume-store.ts); the token never appears in
//     events, logs, or plaintext on disk. (resume-store.test.ts,
//     provider.test.ts: resume round-trip with a fresh provider instance)
//   - NO FABRICATED EVIDENCE: proposedArtifacts is always empty — the
//     agent's claims are not evidence; Kit derives truth from git
//     (ADR-0018).
//
// Approval policy: when the canonical policy does not allow autonomous
// execution for a capability that requires approval, the provider blocks
// with `needs_approval` BEFORE spawning anything — CI runs are autonomous
// but never silent.

import { spawn, type ChildProcess } from 'node:child_process';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  AGENT_EXECUTION_SCHEMA_VERSION,
  type AgentEventSink,
  type AgentExecutionError,
  type AgentExecutionEvent,
  type AgentExecutionHandle,
  type AgentExecutionRequest,
  type AgentExecutionResult,
  type AgentHealth,
  type AgentProvider,
  type AgentProviderCapabilities,
} from '@agentic-sdlc-kit/contracts';
import { buildClaudeArgv, buildClaudeResumeArgv, CLAUDE_VERSION_ARGS } from './claude-argv.js';
import { CLAUDE_CODE_SUPPORTED_CAPABILITIES } from './permission-config.js';
import { ensureRuntimeModsActive } from './mod-parity.js';
import {
  generateResumeToken,
  loadSessionRecord,
  saveSessionRecord,
  verifyResumeToken,
} from './resume-store.js';
import { capabilityOfToolUse, ClaudeStreamParser, type ClaudeFinalResult } from './stream-parser.js';
import { loadExecution } from '../../execution-store.js';

export interface ClaudeCodeProviderOptions {
  /** Where the gateway persists execution records (also roots the encrypted resume store). */
  readonly projectRoot: string;
  /** The claude executable. Default 'claude'. */
  readonly cliPath?: string;
  /**
   * Args inserted before the derived claude args (e.g. a fixture script path
   * when cliPath is a runtime binary). Test seam only; default none.
   */
  readonly cliArgvPrefix?: readonly string[];
  /** Probe timeout for healthCheck (default 3s). */
  readonly healthTimeoutMs?: number;
  /** Bounded output: kill the process past this many stdout+stderr bytes (default 16 MiB). */
  readonly maxOutputBytes?: number;
  /** Grace between SIGTERM and SIGKILL on cancel (default 5s). */
  readonly killGraceMs?: number;
  /** Extra env merged over process.env for the child (test seam). */
  readonly env?: Readonly<Record<string, string>>;
}

const DEFAULT_CLI = 'claude';
const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const DEFAULT_KILL_GRACE_MS = 5_000;
const DEFAULT_RESUME_DURATION_MS = 600_000;

/**
 * Honest enforcement levels (revision C): the gateway owns the process and
 * the event counters, so duration and tool calls are gateway-enforced.
 * Claude reports token usage and cost in its final result, but the provider
 * cannot HARD-enforce them — declared best-effort and reported, never
 * claimed enforced.
 */
const CLAUDE_CODE_BUDGET_ENFORCEMENT: AgentProviderCapabilities['budgetEnforcement'] = {
  maxDurationMs: 'gateway-enforced',
  maxToolCalls: 'gateway-enforced',
  maxInputTokens: 'best-effort',
  maxOutputTokens: 'best-effort',
  maxTotalTokens: 'best-effort',
  maxEstimatedCost: 'best-effort',
};

/** Live, replayable event stream for one execution (same contract as the mock). */
class ExecutionEventStream {
  private sequence = 0;
  private readonly buffer: AgentExecutionEvent[] = [];
  private readonly listeners = new Set<AgentEventSink>();

  constructor(
    private readonly executionId: string,
    private readonly policyHash: string,
  ) {}

  emit(
    payload: Record<string, unknown>,
  ): void {
    this.sequence += 1;
    const event = {
      schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
      eventId: `evt-${this.executionId}-${this.sequence}`,
      executionId: this.executionId,
      sequence: this.sequence,
      policyHash: this.policyHash,
      occurredAt: new Date().toISOString(),
      ...payload,
    } as AgentExecutionEvent;
    this.buffer.push(event);
    for (const sink of this.listeners) sink(event);
  }

  subscribe(sink: AgentEventSink): () => void {
    for (const buffered of this.buffer) sink(buffered);
    this.listeners.add(sink);
    return () => {
      this.listeners.delete(sink);
    };
  }
}

interface RunningExecution {
  readonly child: ChildProcess;
  kill: () => void;
}

interface SpawnContext {
  readonly executionId: string;
  readonly workflowRunId: AgentExecutionResult['workflowRunId'];
  readonly taskId: AgentExecutionResult['taskId'];
  readonly policyHash: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly stream: ExecutionEventStream;
  readonly modsNote: string | undefined;
  readonly signal: AbortSignal;
}

export class ClaudeCodeProvider implements AgentProvider {
  readonly id = 'claude-code' as const;

  private readonly opts: {
    projectRoot: string;
    cliPath: string;
    cliArgvPrefix: readonly string[];
    healthTimeoutMs: number;
    maxOutputBytes: number;
    killGraceMs: number;
    env: Readonly<Record<string, string>>;
  };

  private readonly inFlight = new Map<string, RunningExecution>();

  constructor(opts: ClaudeCodeProviderOptions) {
    this.opts = {
      projectRoot: opts.projectRoot,
      cliPath: opts.cliPath ?? DEFAULT_CLI,
      cliArgvPrefix: opts.cliArgvPrefix ?? [],
      healthTimeoutMs: opts.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS,
      maxOutputBytes: opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
      killGraceMs: opts.killGraceMs ?? DEFAULT_KILL_GRACE_MS,
      env: opts.env ?? {},
    };
  }

  async capabilities(): Promise<AgentProviderCapabilities> {
    return {
      capabilities: [...CLAUDE_CODE_SUPPORTED_CAPABILITIES],
      budgetEnforcement: { ...CLAUDE_CODE_BUDGET_ENFORCEMENT },
    };
  }

  async healthCheck(): Promise<AgentHealth> {
    return this.probeVersion();
  }

  async start(request: AgentExecutionRequest, signal: AbortSignal): Promise<AgentExecutionHandle> {
    const stream = new ExecutionEventStream(request.executionId, request.policyHash);

    // 1. Already-aborted: a cancelled VALUE, never a spawn (mirrors the mock).
    if (signal.aborted) {
      return settledHandle(request.executionId, stream, () =>
        directResult(request, 'cancelled', 'claude-code execution cancelled: aborted before start', [
          { code: 'CANCELLED', message: 'execution aborted before start', retryable: false },
        ]),
      );
    }

    // 2. Approval policy: block BEFORE spawning anything when the policy
    //    requires human approval the run may not take autonomously.
    //    Autonomous-but-never-silent (ADR-0020 §4).
    const approvalBlocked =
      !request.approvalPolicy.allowAutonomousExecution &&
      request.approvalPolicy.requireApprovalFor.some((c) =>
        request.permissions.capabilities.includes(c),
      );
    if (approvalBlocked) {
      const message =
        `the policy snapshot requires human approval for ` +
        `${request.approvalPolicy.requireApprovalFor.join(', ')} and autonomous execution ` +
        `is disabled — the provider did not start the agent`;
      stream.emit({ type: 'execution.started' });
      stream.emit({ type: 'execution.completed', status: 'needs_approval' });
      return settledHandle(request.executionId, stream, () =>
        directResult(request, 'needs_approval', message, [
          { code: 'APPROVAL_REQUIRED', message, retryable: false },
        ]),
      );
    }

    // 3. Runtime Mods parity: link the kit's Mods into the workspace before
    //    the agent can run (honest note either way).
    const mods = await ensureRuntimeModsActive(request.workspace.rootPath);

    // 4. Headless invocation, derived entirely from the canonical policy.
    const { args } = buildClaudeArgv(request);

    return this.spawnAndSettle({
      executionId: request.executionId,
      workflowRunId: request.workflowRunId,
      taskId: request.taskId,
      policyHash: request.policyHash,
      args,
      cwd: request.workspace.rootPath,
      stream,
      modsNote: mods.note,
      signal,
    });
  }

  async resume(executionId: string, resumeToken: string): Promise<AgentExecutionHandle> {
    // The gateway owns the original request (revision A); the provider
    // re-reads its own persisted execution record for the ids/policy it
    // must echo, and the ENCRYPTED session record for the provider session.
    const execution = await loadExecution(this.opts.projectRoot, executionId);
    if (!execution) {
      const stream = new ExecutionEventStream(executionId, 'no-policy');
      return settledHandle(executionId, stream, () =>
        resumeRefusal(executionId, `no persisted execution '${executionId}' — cannot resume`),
      );
    }
    const record = await loadSessionRecord(this.opts.projectRoot, executionId);
    if (!record) {
      const stream = new ExecutionEventStream(executionId, execution.policyHash);
      return settledHandle(executionId, stream, () =>
        resumeRefusal(
          executionId,
          `no encrypted session record for '${executionId}' — the execution cannot be resumed cross-process`,
        ),
      );
    }
    if (!verifyResumeToken(record, resumeToken)) {
      const stream = new ExecutionEventStream(executionId, execution.policyHash);
      return settledHandle(executionId, stream, () =>
        resumeRefusal(executionId, 'invalid resume token — refusing to resume'),
      );
    }

    const { args } = buildClaudeResumeArgv(executionId, record.sessionId);
    const stream = new ExecutionEventStream(executionId, execution.policyHash);
    const budgetMs = execution.request.budget.maxDurationMs;
    return this.spawnAndSettle({
      executionId,
      workflowRunId: execution.workflowRunId,
      taskId: execution.taskId,
      policyHash: execution.policyHash,
      args,
      cwd: execution.request.workspace.rootPath,
      stream,
      modsNote: undefined,
      signal: AbortSignal.timeout(budgetMs > 0 ? budgetMs : DEFAULT_RESUME_DURATION_MS),
    });
  }

  async cancel(executionId: string): Promise<void> {
    // Unknown id: the execution is already stopped — a no-op by contract.
    this.inFlight.get(executionId)?.kill();
  }

  // ---- internals ---------------------------------------------------------

  private childEnv(): NodeJS.ProcessEnv {
    // The child is the user's own claude runtime and needs its own auth
    // config, so the environment is passed through; the provider injects
    // NOTHING beyond the (non-secret) test seam values. ADR-0020 §6.4:
    // environment secrets never enter the agent CONTEXT — the prompt is
    // exactly the request's instructions.
    return { ...process.env, ...this.opts.env };
  }

  private probeVersion(): Promise<AgentHealth> {
    return new Promise<AgentHealth>((resolve) => {
      let done = false;
      const child = spawn(this.opts.cliPath, [...this.opts.cliArgvPrefix, ...CLAUDE_VERSION_ARGS], {
        stdio: ['ignore', 'ignore', 'ignore'],
        shell: false,
        env: this.childEnv(),
      });
      const finish = (health: AgentHealth): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try {
          child.removeAllListeners();
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
        resolve(health);
      };
      const timer = setTimeout(
        () =>
          finish({
            available: false,
            message: `claude CLI at '${this.opts.cliPath}' did not answer --version within ${this.opts.healthTimeoutMs}ms`,
          }),
        this.opts.healthTimeoutMs,
      );
      child.on('error', (err) =>
        finish({
          available: false,
          message:
            `claude CLI not found at '${this.opts.cliPath}' ` +
            `(${(err as NodeJS.ErrnoException).code ?? 'error'}) — install Claude Code, or inject a ` +
            `provider via createFeatureCommand({ agentProviders })`,
        }),
      );
      child.on('exit', (code, sig) => {
        if (code === 0) finish({ available: true, message: `claude CLI available at '${this.opts.cliPath}'` });
        else
          finish({
            available: false,
            message: `claude CLI at '${this.opts.cliPath}' exited ${code ?? `signal ${sig}`} on --version`,
          });
      });
    });
  }

  private spawnAndSettle(ctx: SpawnContext): Promise<AgentExecutionHandle> {
    return new Promise<AgentExecutionHandle>((resolveHandle) => {
      let resolveResult!: (r: AgentExecutionResult) => void;
      const resultPromise = new Promise<AgentExecutionResult>((res) => {
        resolveResult = res;
      });

      let outputBytes = 0;
      let finalResult: ClaudeFinalResult | undefined;
      let weCancelled = false;
      let boundExceeded = false;
      let settled = false;
      let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | undefined;
      let stderrTail = '';
      const startedAt = Date.now();

      const child = spawn(this.opts.cliPath, [...this.opts.cliArgvPrefix, ...ctx.args], {
        cwd: ctx.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env: this.childEnv(),
      });

      const kill = (): void => {
        if (weCancelled || boundExceeded) return;
        weCancelled = true;
        try {
          child.kill('SIGTERM');
        } catch {
          /* already gone */
        }
        const grace = setTimeout(() => {
          try {
            child.kill('SIGKILL');
          } catch {
            /* already gone */
          }
        }, this.opts.killGraceMs);
        grace.unref?.();
      };
      this.inFlight.set(ctx.executionId, { child, kill });

      const onAbort = (): void => kill();
      if (ctx.signal.aborted) kill();
      else ctx.signal.addEventListener('abort', onAbort, { once: true });

      const parser = new ClaudeStreamParser((obs) => {
        switch (obs.kind) {
          case 'init':
            ctx.stream.emit({ type: 'execution.started' });
            break;
          case 'text-delta':
            ctx.stream.emit({ type: 'message.delta', content: obs.content });
            break;
          case 'tool-use': {
            const capability = capabilityOfToolUse(obs);
            // An event never authorizes anything; if the tool is outside the
            // derived table we skip the event rather than assert a capability
            // we cannot honestly name (the gateway counts what it can see).
            if (capability) {
              ctx.stream.emit({
                type: 'tool.requested',
                toolCallId: obs.toolCallId,
                capability,
              });
            }
            break;
          }
          case 'tool-result':
            ctx.stream.emit({
              type: 'tool.result',
              toolCallId: obs.toolCallId,
              status: obs.status,
            });
            break;
          case 'result':
            finalResult = obs.result;
            break;
        }
      });

      const onStdout = (chunk: Buffer): void => {
        outputBytes += chunk.length;
        if (outputBytes > this.opts.maxOutputBytes) {
          boundExceeded = true;
          weCancelled = true; // we initiate this kill too
          try {
            child.kill('SIGTERM');
          } catch {
            /* already gone */
          }
          return;
        }
        for (const line of chunk.toString('utf8').split('\n')) parser.consume(line.trim());
      };
      const onStderr = (chunk: Buffer): void => {
        outputBytes += chunk.length;
        if (stderrTail.length < 8_192) stderrTail = (stderrTail + chunk.toString('utf8')).slice(-8_192);
      };
      child.stdout?.on('data', onStdout);
      child.stderr?.on('data', onStderr);

      const finalize = async (): Promise<void> => {
        if (settled) return;
        settled = true;
        ctx.signal.removeEventListener('abort', onAbort);
        this.inFlight.delete(ctx.executionId);

        const result = this.buildResult({
          ctx,
          finalResult,
          weCancelled,
          boundExceeded,
          durationMs: Date.now() - startedAt,
          stderrTail,
          exitInfo,
        });
        // The encrypted session record must exist before the result is
        // observable, or a cross-process resume test could race it.
        if (result.session?.sessionId) await this.persistSession(result);
        ctx.stream.emit({ type: 'execution.completed', status: result.status });
        resolveResult(result);
      };

      child.on('close', (code, signal) => {
        exitInfo = { code, signal };
        void finalize();
      });
      child.on('error', () => {
        exitInfo = { code: null, signal: null };
        void finalize();
      });

      resolveHandle({
        executionId: ctx.executionId,
        result: () => resultPromise,
        events: (sink: AgentEventSink) => ctx.stream.subscribe(sink),
      });
    });
  }

  private buildResult(input: {
    ctx: SpawnContext;
    finalResult: ClaudeFinalResult | undefined;
    weCancelled: boolean;
    boundExceeded: boolean;
    durationMs: number;
    stderrTail: string;
    exitInfo: { code: number | null; signal: NodeJS.Signals | null } | undefined;
  }): AgentExecutionResult {
    const { ctx, finalResult, weCancelled, boundExceeded, durationMs, stderrTail, exitInfo } = input;
    const base = {
      schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
      executionId: ctx.executionId,
      workflowRunId: ctx.workflowRunId,
      taskId: ctx.taskId,
      providerId: this.id,
      proposedArtifacts: [],
      requestedApprovals: [],
      errors: [] as AgentExecutionError[],
    };

    // Cancellation (SIGINT, gateway cancel, budget breach): a VALUE.
    if (weCancelled && !boundExceeded) {
      return {
        ...base,
        status: 'cancelled',
        summary: withMods('claude-code execution cancelled before completion', ctx.modsNote),
        usage: { durationMs },
        errors: [
          {
            code: 'CANCELLED',
            message: 'execution aborted (SIGINT, gateway cancel, or budget breach)',
            retryable: false,
          },
        ],
      };
    }

    // Bounded output: a budget-class failure, never silent continuation.
    if (boundExceeded) {
      return {
        ...base,
        status: 'failed',
        summary: withMods(
          `claude-code output exceeded the bounded limit of ${this.opts.maxOutputBytes} bytes and the process was killed`,
          ctx.modsNote,
        ),
        usage: { durationMs },
        errors: [{ code: 'BUDGET_EXCEEDED', message: 'output byte bound exceeded', retryable: false }],
      };
    }

    if (finalResult) {
      const usage = {
        durationMs: finalResult.durationMs ?? durationMs,
        ...(finalResult.inputTokens !== undefined ? { inputTokens: finalResult.inputTokens } : {}),
        ...(finalResult.outputTokens !== undefined ? { outputTokens: finalResult.outputTokens } : {}),
        ...(finalResult.totalCostUsd !== undefined
          ? { estimatedCost: finalResult.totalCostUsd, currency: 'USD' }
          : {}),
      };
      // The session + resume credential: token generated here, persisted
      // ENCRYPTED below; the gateway holds it in memory only.
      const session =
        finalResult.sessionId !== undefined
          ? { sessionId: finalResult.sessionId, resumeToken: generateResumeToken() }
          : undefined;

      if (finalResult.subtype === 'success' && !finalResult.isError) {
        const result: AgentExecutionResult = {
          ...base,
          status: 'completed',
          summary: withMods(finalResult.text || 'claude-code completed without a final message', ctx.modsNote),
          ...(session ? { session } : {}),
          usage,
        };
        return result;
      }
      if (finalResult.subtype === 'error_max_turns') {
        const result: AgentExecutionResult = {
          ...base,
          status: 'failed',
          summary: withMods(
            finalResult.text || 'claude-code hit the derived --max-turns bound before completing',
            ctx.modsNote,
          ),
          ...(session ? { session } : {}),
          usage,
          errors: [
            {
              code: 'BUDGET_EXCEEDED',
              message: 'turn bound (--max-turns) reached before completion',
              retryable: false,
            },
          ],
        };
        return result;
      }
      // error_during_execution — or an error shape we do not recognize:
      // fail closed as a failure, never completed.
      const blob = `${finalResult.text} ${stderrTail}`;
      const denied = /permission|not allowed|denied|unauthorized/i.test(blob);
      const result: AgentExecutionResult = {
        ...base,
        status: 'failed',
        summary: withMods(finalResult.text || stderrTail || 'claude-code execution failed', ctx.modsNote),
        ...(session ? { session } : {}),
        usage,
        errors: [
          {
            code: denied ? 'CAPABILITY_DENIED' : 'PROVIDER_INTERNAL',
            message: (finalResult.text || stderrTail || 'claude-code reported an execution error').slice(0, 500),
            retryable: false,
          },
        ],
      };
      return result;
    }

    // No final result object: the CLI crashed, was killed by a signal, or
    // violated the stream contract. Honest statuses, never `completed`.
    const killedBySignal = exitInfo?.signal !== null && exitInfo?.signal !== undefined;
    const message = stderrTail
      ? `claude-code process ended without a result object: ${stderrTail.slice(-300)}`
      : 'claude-code process ended without a result object';
    return {
      ...base,
      status: killedBySignal || exitInfo?.code === 0 || exitInfo === undefined ? 'interrupted' : 'failed',
      summary: withMods(message, ctx.modsNote),
      usage: { durationMs },
      errors: [
        {
          code: exitInfo?.code !== undefined && exitInfo.code !== null && exitInfo.code !== 0 ? 'PROVIDER_INTERNAL' : 'UNKNOWN',
          message:
            `stream ended without a result object ` +
            `(exit ${exitInfo?.code ?? 'n/a'}${exitInfo?.signal ? `, signal ${exitInfo.signal}` : ''})`,
          retryable: false,
        },
      ],
    };
  }

  /** Persist the session record for cross-process resume (encrypted at rest). */
  private async persistSession(result: AgentExecutionResult): Promise<void> {
    if (!result.session?.sessionId) return;
    try {
      await saveSessionRecord(this.opts.projectRoot, {
        executionId: result.executionId,
        providerId: this.id,
        sessionId: result.session.sessionId,
        resumeToken: result.session.resumeToken ?? '',
        createdAt: new Date().toISOString(),
      });
    } catch {
      // Honest degradation: without the encrypted record the session is
      // simply not resumable cross-process; the in-memory token still
      // serves the gateway's own resume API within this process.
      result.session = undefined;
    }
  }
}

function withMods(summary: string, modsNote: string | undefined): string {
  return modsNote ? `${summary} [${modsNote}]` : summary;
}

/** A result for paths that never spawned a process. */
function directResult(
  request: AgentExecutionRequest,
  status: AgentExecutionResult['status'],
  summary: string,
  errors: AgentExecutionError[],
): AgentExecutionResult {
  return {
    schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
    executionId: request.executionId,
    workflowRunId: request.workflowRunId,
    taskId: request.taskId,
    providerId: 'claude-code',
    status,
    summary,
    proposedArtifacts: [],
    requestedApprovals: [],
    errors,
  };
}

/** Resume refusals are failed results (honest values), never throws. */
function resumeRefusal(executionId: string, message: string): AgentExecutionResult {
  return {
    schemaVersion: AGENT_EXECUTION_SCHEMA_VERSION,
    executionId,
    workflowRunId: 'run-resume' as AgentExecutionResult['workflowRunId'],
    taskId: 'task-resume' as AgentExecutionResult['taskId'],
    providerId: 'claude-code',
    status: 'failed',
    summary: message,
    proposedArtifacts: [],
    requestedApprovals: [],
    errors: [{ code: 'SESSION_EXPIRED', message, retryable: false }],
  };
}

/** A handle whose result() is already decided (no spawn happened). */
function settledHandle(
  executionId: string,
  stream: ExecutionEventStream,
  produce: () => AgentExecutionResult,
): Promise<AgentExecutionHandle> {
  const promise = Promise.resolve(produce());
  return Promise.resolve({
    executionId,
    result: () => promise,
    events: (sink: AgentEventSink) => stream.subscribe(sink),
  });
}
