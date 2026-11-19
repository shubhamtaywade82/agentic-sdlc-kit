// packages/core/src/planning/dag.ts
//
// Directed Acyclic Graph (DAG) operations for implementation task planning.
// Computes topological execution order and detects dependency cycles.

import { Errors, type DependencyEdge, type Result, type Task } from "@agentic-sdlc-kit/contracts";

export interface DagAnalysis {
  readonly executionOrder: string[];
  readonly roots: string[];
  readonly leaves: string[];
}

export function buildAdjacencyList(tasks: Task[], edges: DependencyEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const t of tasks) {
    adj.set(t.id, new Set<string>());
  }
  for (const edge of edges) {
    adj.get(edge.from)?.add(edge.to);
  }
  for (const t of tasks) {
    for (const dep of t.dependencies) {
      adj.get(dep)?.add(t.id);
    }
  }
  return adj;
}

function calculateInDegrees(tasks: Task[], adj: Map<string, Set<string>>): Map<string, number> {
  const inDegree = new Map<string, number>();
  for (const t of tasks) inDegree.set(t.id, 0);

  for (const [, neighbors] of adj) {
    for (const neighbor of neighbors) {
      inDegree.set(neighbor, (inDegree.get(neighbor) ?? 0) + 1);
    }
  }
  return inDegree;
}

export function topologicalSort(tasks: Task[], edges: DependencyEdge[]): Result<DagAnalysis> {
  const adj = buildAdjacencyList(tasks, edges);
  const inDegree = calculateInDegrees(tasks, adj);

  const queue: string[] = [];
  const roots: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) {
      queue.push(id);
      roots.push(id);
    }
  }

  const executionOrder: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    executionOrder.push(current);

    const neighbors = adj.get(current) ?? new Set();
    for (const neighbor of neighbors) {
      const nextDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, nextDeg);
      if (nextDeg === 0) queue.push(neighbor);
    }
  }

  if (executionOrder.length !== tasks.length) {
    const unvisited = tasks.filter((t) => !executionOrder.includes(t.id)).map((t) => t.id);
    return {
      ok: false,
      error: Errors.planInvalid(`Dependency cycle detected involving tasks: ${unvisited.join(", ")}`),
    };
  }

  const leaves = tasks.filter((t) => (adj.get(t.id)?.size ?? 0) === 0).map((t) => t.id);
  return { ok: true, value: { executionOrder, roots, leaves } };
}
