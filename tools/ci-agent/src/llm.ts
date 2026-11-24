// tools/ci-agent/src/llm.ts
//
// The single seam between this agent and Ollama Cloud (README invariant 3).
// Every model call in review/autofix/probe flows through structuredChat()
// or listCloudModels() so the transport can be swapped (SDK bump, different
// provider) without touching callers.
//
// Fail-closed contract: a missing key, a transport error, or a reply that
// does not parse and validate against the caller's zod schema throws
// LlmError and the run aborts. Nothing partial is ever applied.
//
// Determinism and cost discipline: temperature 0 + fixed seed 42 on every
// call. The JSON contract is embedded in the system prompt rather than the
// wire `format` parameter because Ollama Cloud rejects the `format`
// parameter (the SDK enforces this with a client-side guard); the reply is
// validated on the way out by the SDK's parseStructuredOutput — fail-closed.

import { OLLAMA_CLOUD_BASE_URL, OllamaClient, parseStructuredOutput } from '@nemesis-oss/ollama-sdk';
import type { z } from 'zod';

/** Default model tag (verify it appears in GET https://ollama.com/api/tags). */
export const DEFAULT_MODEL = 'glm-5.3-flash:cloud';

/** Deterministic sampling: temperature 0, fixed seed 42. */
const DETERMINISTIC_OPTIONS = { temperature: 0, seed: 42 };

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/** Hard error: the run must abort (fail-closed), never degrade to partial output. */
export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface StructuredChatOptions {
  readonly apiKey: string;
  readonly model?: string;
  /** Injectable transport for the offline unit tests (defaults to global fetch). */
  readonly fetch?: typeof globalThis.fetch;
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs?: number;
}

export function resolveModel(explicit: string | undefined): string {
  return explicit !== undefined && explicit.trim() !== '' ? explicit.trim() : DEFAULT_MODEL;
}

function cloudClient(options: StructuredChatOptions, timeoutMs: number): OllamaClient {
  return new OllamaClient({
    baseUrl: OLLAMA_CLOUD_BASE_URL,
    apiKey: options.apiKey,
    fetch: options.fetch,
    timeoutMs,
    // Silent truncation would corrupt reviews and patches: refuse oversized
    // prompts client-side instead of sending a half-prompt.
    onContextOverflow: 'throw',
  });
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * One structured chat call against Ollama Cloud. Returns the zod-validated
 * payload; throws LlmError on transport failure, unparsable output, or
 * schema violation.
 *
 * Ollama Cloud rejects the wire `format` parameter (the SDK's own guard
 * throws on chatWithSchema against ollama.com), so the JSON contract rides
 * in the system prompt (see schemas.ts) and validation happens on the way
 * out via the SDK's resilient parseStructuredOutput — fail-closed.
 */
export async function structuredChat<T>(
  messages: readonly ChatMessage[],
  schema: z.ZodType<T>,
  options: StructuredChatOptions,
): Promise<T> {
  const client = cloudClient(options, options.timeoutMs ?? 120_000);
  try {
    const response = await client.chat({
      model: resolveModel(options.model),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      options: DETERMINISTIC_OPTIONS,
    });
    const content = response.message?.content ?? '';
    return parseStructuredOutput(content, schema);
  } catch (err) {
    throw new LlmError(`Ollama Cloud structured chat failed: ${describe(err)}`);
  } finally {
    // Abort any residual in-flight request so short-lived CLI runs exit cleanly.
    client.destroy();
  }
}

/** List the model tags the account's subscription offers (probe gate 2). */
export async function listCloudModels(
  options: StructuredChatOptions,
): Promise<readonly string[]> {
  const client = cloudClient(options, options.timeoutMs ?? 30_000);
  try {
    const models = await client.listModels();
    return models.map((m) => m.name);
  } catch (err) {
    throw new LlmError(`Ollama Cloud model listing failed: ${describe(err)}`);
  } finally {
    client.destroy();
  }
}
