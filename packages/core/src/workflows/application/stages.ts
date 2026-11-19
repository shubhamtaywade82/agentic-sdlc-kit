// packages/core/src/workflows/application/stages.ts
//
// Stage interfaces for the application workflow. M8 ships these as
// interfaces with stub implementations that return NOT_IMPLEMENTED. The
// real stage logic lands as Skills (M3+) and the M5/M6 engines drive the
// implementation and verification stages.
//
// A stage handler takes the current state and context and returns a
// stage result: either `advanced` (ready for the next stage), `blocked`
// (waiting on approval or unresolved decision), or `failed`.

import {
  Errors,
  type Result,
  type ApplicationState,
  type ApplicationContext,
} from '@agentic-sdlc-kit/contracts';

export type StageOutcome = 'advanced' | 'blocked' | 'failed';

export interface StageResult {
  outcome: StageOutcome;
  contextPatch: Partial<ApplicationContext>;
  reason: string;
}

export interface StageHandler {
  readonly stage: ApplicationState['stage'];
  run(state: ApplicationState, ctx: ApplicationContext): Promise<Result<StageResult>>;
}

/**
 * M8 stub handler: returns NOT_IMPLEMENTED for stages whose real logic
// lands in later milestones (M3+ for requirements, M4 for architecture,
// M5 for implementation, M6 for verification).
 */
export class StubStageHandler implements StageHandler {
  constructor(readonly stage: ApplicationState['stage']) {}
  async run(): Promise<Result<StageResult>> {
    return {
      ok: false,
      error: Errors.notImplemented(
        `stage ${this.stage} is not implemented in M8 contracts release; lands with M3-M6 engines`,
        { stage: this.stage },
      ),
    };
  }
}

/**
 * Registry of stage handlers. The dispatcher in
// packages/core/src/workflows/application/dispatcher.ts queries this.
 */
export class StageRegistry {
  private handlers = new Map<ApplicationState['stage'], StageHandler>();
  register(handler: StageHandler): void {
    this.handlers.set(handler.stage, handler);
  }
  get(stage: ApplicationState['stage']): StageHandler | undefined {
    return this.handlers.get(stage);
  }
}

/**
 * Build a registry with stub handlers for every stage. Real handlers are
 * registered in M8+ once the corresponding engines ship.
 */
export function createStubStageRegistry(): StageRegistry {
  const reg = new StageRegistry();
  const stages: ReadonlyArray<ApplicationState['stage']> = [
    'intake',
    'discovery',
    'requirements',
    'architecture',
    'planning',
    'scaffolding',
    'implementation',
    'verification',
    'review',
    'release',
  ];
  for (const s of stages) reg.register(new StubStageHandler(s));
  return reg;
}
