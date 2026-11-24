import ELK from 'elkjs/lib/elk.bundled.js';
import type { ElkExtendedEdge, ElkNode } from 'elkjs/lib/elk-api';
import type { Edge, Node } from '@xyflow/react';
import type { Group, InfraEdge, InfraNode } from '../dsl/types';
import type { VisibleGraph } from './filter';

export const NODE_W = 190;
export const NODE_H = 64;
const GROUP_PADDING = '[top=44,left=20,bottom=20,right=20]';

const elk = new ELK();

export type InfraNodeData = { node: InfraNode };
export type GroupNodeData = { group: Group };
export type AtlasNode = Node<InfraNodeData, 'infra'> | Node<GroupNodeData, 'zone'>;
export type AtlasEdge = Edge<{ edge: InfraEdge }>;

/** Build the ELK hierarchy, run the layout, and flatten it into React Flow nodes. */
export async function layoutGraph(graph: VisibleGraph): Promise<{ nodes: AtlasNode[]; edges: AtlasEdge[] }> {
  const childrenOf = new Map<string | undefined, ElkNode[]>();
  const push = (parent: string | undefined, n: ElkNode) => {
    const list = childrenOf.get(parent) ?? [];
    list.push(n);
    childrenOf.set(parent, list);
  };

  for (const g of graph.groups) {
    push(g.parent, {
      id: g.id,
      layoutOptions: {
        'elk.padding': GROUP_PADDING,
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '40',
        'elk.layered.spacing.nodeNodeBetweenLayers': '60',
      },
    });
  }
  for (const n of graph.nodes) {
    push(n.group, { id: n.id, width: NODE_W, height: NODE_H });
  }

  // Attach children to their parent ELK node.
  const elkById = new Map<string, ElkNode>();
  for (const list of childrenOf.values()) for (const n of list) elkById.set(n.id, n);
  for (const [parent, list] of childrenOf) {
    if (parent === undefined) continue;
    const p = elkById.get(parent);
    if (p) p.children = list;
  }

  // Only primary (solid) edges drive the layering. Dashed edges are secondary
  // traffic (egress, replication, scraping) and would otherwise drag nodes
  // like the internet gateway to the wrong end of the picture.
  const edges: ElkExtendedEdge[] = graph.edges
    .map((e, i) => ({ e, id: e.id ?? `e${i}-${e.from}-${e.to}` }))
    .filter(({ e }) => e.style !== 'dashed')
    .map(({ e, id }) => ({ id, sources: [e.from], targets: [e.to] }));

  const root: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.spacing.nodeNode': '50',
      'elk.layered.spacing.nodeNodeBetweenLayers': '80',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: childrenOf.get(undefined) ?? [],
    edges,
  };

  const laid = await elk.layout(root);

  const groupById = new Map(graph.groups.map((g) => [g.id, g]));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const rfNodes: AtlasNode[] = [];

  const walk = (n: ElkNode, parent?: string) => {
    for (const c of n.children ?? []) {
      const base = {
        id: c.id,
        position: { x: c.x ?? 0, y: c.y ?? 0 },
        parentId: parent,
        extent: parent ? ('parent' as const) : undefined,
        draggable: false,
      };
      const group = groupById.get(c.id);
      if (group) {
        rfNodes.push({
          ...base,
          type: 'zone',
          data: { group },
          style: { width: c.width, height: c.height },
          selectable: true,
        });
        walk(c, c.id);
      } else {
        const node = nodeById.get(c.id)!;
        rfNodes.push({ ...base, type: 'infra', data: { node }, width: NODE_W, height: NODE_H });
      }
    }
  };
  walk(laid);

  const rfEdges: AtlasEdge[] = graph.edges.map((e, i) => ({
    id: e.id ?? `e${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    label: e.label ?? e.protocol,
    type: 'smoothstep',
    data: { edge: e },
    markerEnd: { type: 'arrowclosed' as never, width: 16, height: 16 },
    style: e.style === 'dashed' ? { strokeDasharray: '6 4', opacity: 0.6 } : undefined,
    labelStyle: { fontSize: 10, fill: '#9da6b4', fontFamily: "'JetBrains Mono', monospace" },
    labelBgStyle: { fill: '#13161c', fillOpacity: 0.92 },
    labelBgPadding: [4, 6] as [number, number],
    labelBgBorderRadius: 3,
    zIndex: 1000,
  }));

  return { nodes: rfNodes, edges: rfEdges };
}
