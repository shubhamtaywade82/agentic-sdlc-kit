/**
 * model-router — Claude Code mod entry point.
 *
 * Model/effort routing. DEFAULT OFF: the router activates only when
 * `router.enabled` is true or `router.agents` is non-empty in
 * `.ai/project.yml`; with no profile it is fully pass-through.
 *
 *   - agent.spawn: apply explicit agent model mappings (skips resumed runs,
 *     whose changes are ignored by the runtime anyway)
 *   - turn.step (async generator): pin the MAIN conversation model only when
 *     `router.main.model` is explicitly configured (pinned-model preservation);
 *     subagent model requests are never rewritten here — observe only
 *
 * Errors degrade to pass-through: routing is not a gating hook, so there is no
 * `.catch` fail-closed chain — a broken router must not block work.
 */

import { routeAgent, routeMain } from '../policies/classify.ts';
import { defaultRouterConfig, parseRouterProfile, routerActive } from '../policies/profile.ts';
import type { RouterConfig } from '../policies/classify.ts';

/** Loaded once per plugin load (session reload picks up profile changes). */
let cfgCache: RouterConfig | null = null;

async function loadRouterConfig($: ModApi): Promise<RouterConfig> {
  if (cfgCache !== null) return cfgCache;
  let cfg: RouterConfig;
  try {
    if (await $.fs.exists('.ai/project.yml')) {
      cfg = parseRouterProfile(await $.fs.read('.ai/project.yml'));
    } else {
      cfg = defaultRouterConfig();
    }
  } catch (err) {
    // Fail-safe default: router off — fully pass-through.
    $.ui.log(
      'model-router: could not read .ai/project.yml — router disabled (' + String(err) + ')',
    );
    cfg = defaultRouterConfig();
  }
  cfgCache = cfg;
  return cfg;
}

/** Log the main-model pin once per session (not on every request). */
let mainPinLoggedSession: string | null = null;

export function register(on: OnFn, options: RegisterOptions): void {
  void options;

  // -----------------------------------------------------------------------
  // Subagent / teammate spawns: apply explicit model mappings
  // -----------------------------------------------------------------------
  on('agent.spawn', async ($, e, next) => {
    if (e.resume) return next(e); // resumed runs ignore changes — skip
    let model: string | undefined;
    let name = '';
    let reason = '';
    try {
      const cfg = await loadRouterConfig($);
      if (!routerActive(cfg)) return next(e); // DEFAULT OFF — zero behavior
      name = typeof e.name === 'string' ? e.name : '';
      const decision = routeAgent(name, cfg);
      if (decision === null) return next(e);
      reason = decision.reason;
      if (decision.model === undefined) return next(e); // keyword tier: engine default stands
      model = decision.model;
    } catch {
      return next(e);
    }
    $.ui.log('model-router: ' + name + ' -> ' + model + ' (' + reason + ')');
    return next({ ...e, model });
  });

  // -----------------------------------------------------------------------
  // Main-conversation model requests: pin only when explicitly configured
  // -----------------------------------------------------------------------
  on('turn.step', async function* ($, e, next) {
    let pinned: { model: string } | null = null;
    try {
      const cfg = await loadRouterConfig($);
      if (routerActive(cfg)) {
        const isSubagentRequest =
          typeof e.agentId === 'string' && e.agentId !== '';
        // Never rewrite subagent requests here — their model was chosen at spawn.
        if (!isSubagentRequest) {
          const currentModel = typeof e.model === 'string' ? e.model : undefined;
          pinned = routeMain(currentModel, cfg);
        }
        if (pinned !== null) {
          // $.ui.log the pin once per session, not on every model request
          let sessionId = '';
          try {
            sessionId = $.session.id();
          } catch {
            sessionId = '';
          }
          if (mainPinLoggedSession !== sessionId) {
            mainPinLoggedSession = sessionId;
            $.ui.log(
              'model-router: main conversation pinned to ' + pinned.model + ' by .ai/project.yml',
            );
          }
        }
      }
    } catch {
      pinned = null; // degrade to pass-through
    }
    if (pinned !== null) {
      const result = yield* next({ ...e, model: pinned.model });
      return result;
    }
    const result = yield* next(e);
    return result;
  });
}
