import type { Architecture, Group, InfraEdge, InfraNode, Stage, StageScoped } from './types';

export interface NodeChange {
  id: string;
  label: string;
  /** Human-readable field changes, e.g. "replicas 1 → 3". */
  details: string[];
}

export interface StageDiff {
  addedNodes: InfraNode[];
  removedNodes: InfraNode[];
  changedNodes: NodeChange[];
  /** Ids of nodes and groups that first appear in this stage (for highlighting). */
  newIds: Set<string>;
  changedIds: Set<string>;
}

export interface StageView {
  /** The architecture as it looks at this stage: filtered, overrides applied, no stage fields. */
  arch: Architecture;
  stages: Stage[];
  index: number;
  stage?: Stage;
  /** Compared to the previous stage. Empty for the first stage or when there are no stages. */
  diff: StageDiff;
}

const emptyDiff = (): StageDiff => ({
  addedNodes: [],
  removedNodes: [],
  changedNodes: [],
  newIds: new Set(),
  changedIds: new Set(),
});

export function isVisibleAt(item: StageScoped, order: Map<string, number>, index: number): boolean {
  const from = item.since === undefined ? 0 : (order.get(item.since) ?? 0);
  const to = item.until === undefined ? Infinity : (order.get(item.until) ?? Infinity);
  return index >= from && index <= to;
}

/** Apply `at` overrides of every stage up to and including `index`, in stage order. */
function applyAt<T extends StageScoped & { at?: Record<string, Partial<T>> }>(item: T, stages: Stage[], index: number): T {
  let out: T = { ...item };
  for (let k = 0; k <= index && k < stages.length; k++) {
    const patch = item.at?.[stages[k].id];
    if (patch) out = { ...out, ...patch };
  }
  delete out.at;
  delete out.since;
  delete out.until;
  return out;
}

/** The plain architecture visible at one stage. */
export function architectureAt(arch: Architecture, index: number): Architecture {
  const stages = arch.stages ?? [];
  if (stages.length === 0) return arch;
  const order = new Map(stages.map((s, i) => [s.id, i]));

  const groups = arch.groups
    .filter((g) => isVisibleAt(g, order, index))
    .map((g) => applyAt<Group>(g, stages, index));
  const nodes = arch.nodes
    .filter((n) => isVisibleAt(n, order, index))
    .map((n) => applyAt<InfraNode>(n, stages, index));
  const nodeIds = new Set(nodes.map((n) => n.id));
  // An edge disappears with either of its ends, so authors do not have to repeat since/until on edges.
  const edges = arch.edges
    .filter((e) => isVisibleAt(e, order, index) && nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => applyAt<InfraEdge>(e, stages, index));
  // A trace is offered only in stages where every one of its hops exists.
  const edgeKeys = new Set(edges.map((e) => `${e.from}->${e.to}`));
  const traces = arch.traces?.filter((t) => t.steps.every((s) => edgeKeys.has(`${s.from}->${s.to}`)));

  return { ...arch, groups, nodes, edges, traces, stages: undefined };
}

export function resolveStage(arch: Architecture, requested: number): StageView {
  const stages = arch.stages ?? [];
  if (stages.length === 0) return { arch, stages, index: 0, diff: emptyDiff() };

  const index = Math.max(0, Math.min(requested, stages.length - 1));
  const cur = architectureAt(arch, index);
  const view: StageView = { arch: cur, stages, index, stage: stages[index], diff: emptyDiff() };
  if (index === 0) return view;

  const prev = architectureAt(arch, index - 1);
  const prevNodes = new Map(prev.nodes.map((n) => [n.id, n]));
  const curNodes = new Map(cur.nodes.map((n) => [n.id, n]));
  const prevGroupIds = new Set(prev.groups.map((g) => g.id));
  const groupLabel = (a: Architecture, id?: string) =>
    id === undefined ? '(none)' : (a.groups.find((g) => g.id === id)?.label ?? id);
  const diff = view.diff;

  for (const g of cur.groups) if (!prevGroupIds.has(g.id)) diff.newIds.add(g.id);
  for (const n of cur.nodes) {
    const before = prevNodes.get(n.id);
    if (!before) {
      diff.addedNodes.push(n);
      diff.newIds.add(n.id);
      continue;
    }
    const details: string[] = [];
    if (before.label !== n.label) details.push(`renamed from "${before.label}"`);
    if (before.group !== n.group) details.push(`moved: ${groupLabel(prev, before.group)} → ${groupLabel(cur, n.group)}`);
    if (before.product !== n.product) details.push(`${before.product ?? '(none)'} → ${n.product ?? '(none)'}`);
    if ((before.replicas ?? 1) !== (n.replicas ?? 1)) details.push(`replicas ${before.replicas ?? 1} → ${n.replicas ?? 1}`);
    if (details.length) {
      diff.changedNodes.push({ id: n.id, label: n.label, details });
      diff.changedIds.add(n.id);
    }
  }
  for (const n of prev.nodes) if (!curNodes.has(n.id)) diff.removedNodes.push(n);
  return view;
}
