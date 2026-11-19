// Smoke test for the ai-dev-kit SDLC MCP server.
// Run from the kit root after building core/mcp/server:
//   node tests/mcp-smoke.mjs
// Spawns the server over stdio, performs the JSON-RPC handshake, lists the
// tools, and calls a representative tool. Exits 0 only if everything answers.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, "..", "core", "mcp", "server", "build", "index.js");

const EXPECTED_TOOLS = [
  "sdlc_stages",
  "sdlc_workflow",
  "sdlc_next_stage",
  "sdlc_template",
  "sdlc_checklist",
];

const child = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "inherit"],
});
child.on("error", (err) => {
  console.error("smoke: failed to spawn server:", err.message);
  process.exit(1);
});

const pending = new Map();
let buffer = "";
let nextId = 1;

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString("utf8");
  let nl;
  while ((nl = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, nl).trim();
    buffer = buffer.slice(nl + 1);
    if (!line) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      console.error("smoke: non-JSON line on stdout:", line);
      process.exit(1);
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

function send(msg) {
  child.stdin.write(JSON.stringify(msg) + "\n");
}

function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${method} (id ${id})`)),
      15000,
    );
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

function notify(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

const failures = [];
function check(name, cond) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures.push(name);
    console.error(`  FAIL: ${name}`);
  }
}

try {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0.0.0" },
  });
  check("initialize answers", init?.result?.serverInfo?.name === "ai-dev-kit-sdlc");
  notify("notifications/initialized", {});

  const tools = await request("tools/list", {});
  const names = (tools?.result?.tools ?? []).map((t) => t.name);
  for (const expected of EXPECTED_TOOLS) {
    check(`tool listed: ${expected}`, names.includes(expected));
  }

  const stages = await request("tools/call", {
    name: "sdlc_stages",
    arguments: {},
  });
  const stagesText = stages?.result?.content?.[0]?.text ?? "";
  check("sdlc_stages returns stages", stagesText.includes("05-development") && stagesText.includes("08-release") && stagesText.includes("mode"));

  const workflow = await request("tools/call", {
    name: "sdlc_workflow",
    arguments: { stage: "08-release" },
  });
  const workflowText = workflow?.result?.content?.[0]?.text ?? "";
  check(
    "sdlc_workflow returns release gates",
    workflowText.includes("approval") && workflowText.includes("tag"),
  );

  const next = await request("tools/call", {
    name: "sdlc_next_stage",
    arguments: { stage: "04-planning" },
  });
  const nextText = next?.result?.content?.[0]?.text ?? "";
  check("sdlc_next_stage returns 05", nextText.includes("05-development"));

  const tmpl = await request("tools/call", {
    name: "sdlc_template",
    arguments: { template: "prd" },
  });
  check(
    "sdlc_template returns PRD",
    (tmpl?.result?.content?.[0]?.text ?? "").includes("Acceptance criteria"),
  );

  const checklist = await request("tools/call", {
    name: "sdlc_checklist",
    arguments: { checklist: "security" },
  });
  check(
    "sdlc_checklist returns security items",
    (checklist?.result?.content?.[0]?.text ?? "").includes("Input validation"),
  );
} catch (err) {
  failures.push(err.message);
  console.error("smoke: error:", err.message);
} finally {
  child.kill();
}

if (failures.length > 0) {
  console.error(`MCP smoke test FAILED (${failures.length} failures).`);
  process.exit(1);
}
console.log("MCP smoke test passed.");
