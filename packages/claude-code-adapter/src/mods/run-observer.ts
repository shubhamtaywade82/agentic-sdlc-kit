// packages/claude-code-adapter/src/mods/run-observer.ts
//
// M13 Run Observer Mod: telemetry and runtime event observer.
// Collects execution traces, tool call frequencies, token usage, and verification reports.

import type { RuntimeEvent } from "../contracts/runtime-event.js";

export interface ObserverMetrics {
  totalEvents: number;
  toolCalls: Record<string, number>;
  tokensIn: number;
  tokensOut: number;
  verificationPassed: number;
  verificationFailed: number;
}

export class RunObserver {
  private readonly events: RuntimeEvent[] = [];
  private readonly metrics: ObserverMetrics = {
    totalEvents: 0,
    toolCalls: {},
    tokensIn: 0,
    tokensOut: 0,
    verificationPassed: 0,
    verificationFailed: 0,
  };

  record(event: RuntimeEvent): void {
    this.events.push(event);
    this.metrics.totalEvents++;

    if (event.kind === "tool-call") {
      this.metrics.toolCalls[event.tool] = (this.metrics.toolCalls[event.tool] ?? 0) + 1;
    } else if (event.kind === "model-request") {
      this.metrics.tokensIn += event.tokensIn ?? 0;
      this.metrics.tokensOut += event.tokensOut ?? 0;
    } else if (event.kind === "verification") {
      if (event.report.status === "passed") {
        this.metrics.verificationPassed++;
      } else {
        this.metrics.verificationFailed++;
      }
    }
  }

  getMetrics(): Readonly<ObserverMetrics> {
    return { ...this.metrics, toolCalls: { ...this.metrics.toolCalls } };
  }

  getTrace(): readonly RuntimeEvent[] {
    return [...this.events];
  }
}
