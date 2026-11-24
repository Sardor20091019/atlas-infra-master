import type { Architecture, Group, InfraEdge, InfraNode, LayerId } from '../dsl/types';

export interface VisibleGraph {
  groups: Group[];
  nodes: InfraNode[];
  edges: InfraEdge[];
}

/**
 * Keep only items whose layer is active. When a group is hidden, its visible
 * children are re-parented to the nearest visible ancestor so the picture
 * stays coherent (e.g. hide "network" and pods still sit inside the cluster
 * inside the datacenter).
 */
export function filterByLayers(arch: Architecture, active: Set<LayerId>): VisibleGraph {
  const groupById = new Map(arch.groups.map((g) => [g.id, g]));
  const visibleGroupIds = new Set(arch.groups.filter((g) => active.has(g.layer)).map((g) => g.id));

  const nearestVisibleAncestor = (groupId: string | undefined): string | undefined => {
    let cur = groupId;
    while (cur) {
      if (visibleGroupIds.has(cur)) return cur;
      cur = groupById.get(cur)?.parent;
    }
    return undefined;
  };

  const groups = arch.groups
    .filter((g) => visibleGroupIds.has(g.id))
    .map((g) => ({ ...g, parent: nearestVisibleAncestor(g.parent) }));

  const nodes = arch.nodes
    .filter((n) => active.has(n.layer))
    .map((n) => ({ ...n, group: nearestVisibleAncestor(n.group) }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = arch.edges.filter(
    (e) => active.has(e.layer) && nodeIds.has(e.from) && nodeIds.has(e.to),
  );

  return { groups, nodes, edges };
}
