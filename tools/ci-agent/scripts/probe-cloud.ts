// tools/ci-agent/scripts/probe-cloud.ts
//
// Live connectivity canary for Ollama Cloud (npm run probe). Three gates:
//   1. auth/transport: the model listing succeeds
//   2. tag: the configured model is offered by the subscription
//   3. inference: a schema-conformant structured reply comes back
// Any gate failing exits 1 (the canary is the one place a live problem is
// allowed to be red); a missing OLLAMA_API_KEY exits 0 with a notice —
// workflows degrade to an explicit skip, never a failure, when
// unconfigured (README setup §1).
//
// Env: OLLAMA_API_KEY (required for a real probe), OLLAMA_MODEL (optional
// override; defaults to the agent default tag).

import { z } from 'zod';
import { listCloudModels, resolveModel, structuredChat } from '../src/llm.js';

const ProbeReply = z.object({ status: z.literal('ok'), reply: z.string().min(1).max(200) });

function notice(message: string): void {
  console.log(`::notice::${message}`);
}

async function main(): Promise<number> {
  const apiKey = process.env.OLLAMA_API_KEY ?? '';
  if (apiKey === '') {
    notice('OLLAMA_API_KEY is not configured — connectivity canary skipped (skip, not failure).');
    return 0;
  }
  const model = resolveModel(process.env.OLLAMA_MODEL);
  const options = { apiKey, model, timeoutMs: 60_000 };

  // Gate 1 — auth and transport.
  let tags: readonly string[];
  try {
    tags = await listCloudModels(options);
  } catch (err) {
    console.error(`gate 1 FAILED (auth/transport): ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  console.log(`gate 1 ok: account offers ${tags.length} model tag(s).`);

  // Gate 2 — the pinned model tag exists.
  if (!tags.includes(model)) {
    console.error(
      `gate 2 FAILED (model tag): '${model}' is not offered by this subscription. ` +
        `Check GET https://ollama.com/api/tags and update OLLAMA_MODEL / OLLAMA_MODEL_REVIEW / OLLAMA_MODEL_FIX. ` +
        `Offered tags include: ${tags.slice(0, 20).join(', ')}`,
    );
    return 1;
  }
  console.log(`gate 2 ok: model tag '${model}' is offered.`);

  // Gate 3 — schema-conformant inference.
  const started = Date.now();
  try {
    const reply = await structuredChat(
      [
        {
          role: 'user',
          content:
            'Reply with exactly one JSON object of the shape {"status":"ok","reply":"<one short sentence>"} where reply states that the Agentic SDLC Kit canary reached Ollama Cloud.',
        },
      ],
      ProbeReply,
      options,
    );
    const elapsedMs = Date.now() - started;
    console.log(`gate 3 ok (${elapsedMs}ms): ${reply.reply}`);
    return 0;
  } catch (err) {
    console.error(`gate 3 FAILED (structured inference): ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}

const code = await main();
process.exit(code);
