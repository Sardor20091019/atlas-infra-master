import type { Architecture, StageScoped } from './types';
import { architectureAt } from './stages';

export type IssuePath = (string | number)[];

export interface Issue {
  severity: 'error' | 'warning';
  message: string;
  /** Path into the architecture document, e.g. ['nodes', 3, 'group']. */
  path: IssuePath;
}

/**
 * Semantic checks that a schema cannot express: references between items,
 * duplicate ids, parent cycles, undeclared layers, traces that follow edges.
 * Errors make the architecture unrenderable; warnings are advice.
 */
export function validateArchitecture(arch: Architecture): Issue[] {
  const issues: Issue[] = [];
  const error = (message: string, path: IssuePath) => issues.push({ severity: 'error', message, path });
  const warn = (message: string, path: IssuePath) => issues.push({ severity: 'warning', message, path });

  const layers = new Set(arch.layers);
  const groupIds = new Set<string>();
  const nodeIds = new Set<string>();

  arch.groups.forEach((g, i) => {
    if (groupIds.has(g.id)) error(`Duplicate group id "${g.id}"`, ['groups', i, 'id']);
    groupIds.add(g.id);
  });
  arch.nodes.forEach((n, i) => {
    if (nodeIds.has(n.id)) error(`Duplicate node id "${n.id}"`, ['nodes', i, 'id']);
    if (groupIds.has(n.id)) error(`Node id "${n.id}" is already used by a group`, ['nodes', i, 'id']);
    nodeIds.add(n.id);
  });

  const parentOf = new Map(arch.groups.map((g) => [g.id, g.parent]));
  arch.groups.forEach((g, i) => {
    if (!layers.has(g.layer)) error(`Layer "${g.layer}" is not listed in layers`, ['groups', i, 'layer']);
    if (g.parent !== undefined) {
      if (!groupIds.has(g.parent)) error(`Parent group "${g.parent}" does not exist`, ['groups', i, 'parent']);
      // Walk up the chain; revisiting a group means a cycle.
      const seen = new Set([g.id]);
      let cur: string | undefined = g.parent;
      while (cur !== undefined && groupIds.has(cur)) {
        if (seen.has(cur)) {
          error(`Group "${g.id}" is inside itself (parent cycle)`, ['groups', i, 'parent']);
          break;
        }
        seen.add(cur);
        cur = parentOf.get(cur);
      }
    }
  });

  arch.nodes.forEach((n, i) => {
    if (!layers.has(n.layer)) error(`Layer "${n.layer}" is not listed in layers`, ['nodes', i, 'layer']);
    if (n.group !== undefined && !groupIds.has(n.group)) {
      error(`Group "${n.group}" does not exist`, ['nodes', i, 'group']);
    }
    if (!n.why) warn(`Node "${n.id}" has no "why": explain why it is here`, ['nodes', i]);
  });

  const refError = (id: string, path: IssuePath) =>
    groupIds.has(id)
      ? error(`"${id}" is a group; edges connect nodes`, path)
      : error(`Node "${id}" does not exist`, path);

  arch.edges.forEach((e, i) => {
    if (!layers.has(e.layer)) error(`Layer "${e.layer}" is not listed in layers`, ['edges', i, 'layer']);
    if (!nodeIds.has(e.from)) refError(e.from, ['edges', i, 'from']);
    if (!nodeIds.has(e.to)) refError(e.to, ['edges', i, 'to']);
  });

  const edgeKeys = new Set(arch.edges.map((e) => `${e.from}->${e.to}`));
  (arch.traces ?? []).forEach((t, ti) => {
    if (t.steps.length === 0) error(`Trace "${t.id}" has no steps`, ['traces', ti, 'steps']);
    t.steps.forEach((st, si) => {
      if (!edgeKeys.has(`${st.from}->${st.to}`)) {
        error(`No edge ${st.from} → ${st.to}; trace steps must follow edges`, ['traces', ti, 'steps', si]);
      }
    });
  });

  validateStages(arch, groupIds, error, warn);
  return issues;
}

type Report = (message: string, path: IssuePath) => void;

/** since / until / at must point at declared stages, and each stage must be consistent on its own. */
function validateStages(arch: Architecture, groupIds: Set<string>, error: Report, warn: Report): void {
  const stages = arch.stages ?? [];
  const order = new Map<string, number>();
  stages.forEach((st, i) => {
    if (order.has(st.id)) error(`Duplicate stage id "${st.id}"`, ['stages', i, 'id']);
    order.set(st.id, i);
  });

  let referenceErrors = 0;
  const refError: Report = (message, path) => {
    error(message, path);
    referenceErrors++;
  };
  const checkScoped = (item: StageScoped & { at?: Record<string, unknown> }, base: IssuePath) => {
    for (const key of ['since', 'until'] as const) {
      const v = item[key];
      if (v === undefined) continue;
      if (stages.length === 0) refError(`"${key}" needs a stages list`, [...base, key]);
      else if (!order.has(v)) refError(`Stage "${v}" does not exist`, [...base, key]);
    }
    if (item.since && item.until && (order.get(item.since) ?? 0) > (order.get(item.until) ?? 0)) {
      refError(`"since" comes after "until"`, [...base, 'until']);
    }
    for (const stageId of Object.keys(item.at ?? {})) {
      if (!order.has(stageId)) {
        refError(stages.length ? `Stage "${stageId}" does not exist` : `"at" needs a stages list`, [...base, 'at', stageId]);
      }
    }
  };
  arch.groups.forEach((g, i) => {
    checkScoped(g, ['groups', i]);
    for (const [st, o] of Object.entries(g.at ?? {})) {
      if (o.parent !== undefined && !groupIds.has(o.parent)) {
        refError(`Parent group "${o.parent}" does not exist`, ['groups', i, 'at', st, 'parent']);
      }
    }
  });
  arch.nodes.forEach((n, i) => {
    checkScoped(n, ['nodes', i]);
    for (const [st, o] of Object.entries(n.at ?? {})) {
      if (o.group !== undefined && !groupIds.has(o.group)) {
        refError(`Group "${o.group}" does not exist`, ['nodes', i, 'at', st, 'group']);
      }
    }
  });
  arch.edges.forEach((e, i) => checkScoped(e, ['edges', i]));
  if (stages.length === 0 || referenceErrors > 0) return;

  // Which line set the value that is active at stage `index`? Points errors at the override, not the base.
  const sourceOf = (item: { at?: Record<string, object> }, field: string, index: number, base: IssuePath): IssuePath => {
    for (let k = index; k >= 0; k--) {
      const patch = item.at?.[stages[k].id];
      if (patch && field in patch) return [...base, 'at', stages[k].id, field];
    }
    return [...base, field];
  };

  const usableTraces = new Set<string>();
  stages.forEach((st, index) => {
    const view = architectureAt(arch, index);
    const visibleGroups = new Set(view.groups.map((g) => g.id));
    for (const g of view.groups) {
      if (g.parent !== undefined && !visibleGroups.has(g.parent)) {
        const i = arch.groups.findIndex((x) => x.id === g.id);
        error(`In stage "${st.id}", parent "${g.parent}" is not present`, sourceOf(arch.groups[i], 'parent', index, ['groups', i]));
      }
    }
    for (const n of view.nodes) {
      if (n.group !== undefined && !visibleGroups.has(n.group)) {
        const i = arch.nodes.findIndex((x) => x.id === n.id);
        error(`In stage "${st.id}", group "${n.group}" is not present`, sourceOf(arch.nodes[i], 'group', index, ['nodes', i]));
      }
    }
    for (const t of view.traces ?? []) usableTraces.add(t.id);
  });
  (arch.traces ?? []).forEach((t, i) => {
    if (!usableTraces.has(t.id)) warn(`Trace "${t.id}" is not complete in any stage, so it is never shown`, ['traces', i, 'id']);
  });
}
