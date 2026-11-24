import { z } from 'zod';
import { GROUP_KINDS, LAYERS, type LayerId, type NodeType } from './types.js';
import { NODE_TYPES } from './vocabulary.js';

const LAYER_IDS = Object.keys(LAYERS) as [LayerId, ...LayerId[]];
const NODE_TYPE_IDS = Object.keys(NODE_TYPES) as [NodeType, ...NodeType[]];

/** Plain edit distance, enough to catch typos in short enum values. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

/** "Unknown node type "databse". Did you mean "database"?" instead of dumping every option. */
function enumError(what: string, options: readonly string[]) {
  return (issue: { input?: unknown }) => {
    // Absent values are reported as "missing field" by the parser.
    if (issue.input === undefined) return 'Required';
    const value = String(issue.input);
    const best = options
      .map((o) => [o, distance(value.toLowerCase(), o)] as const)
      .sort((a, b) => a[1] - b[1])[0];
    const hint = best && best[1] <= Math.max(2, value.length / 3) ? ` Did you mean "${best[0]}"?` : '';
    return `Unknown ${what} "${value}".${hint} Press Ctrl+Space for the list.`;
  };
}

const id = z.string().min(1).regex(/^[A-Za-z0-9_.:-]+$/, 'Use letters, digits, "-", "_", "." or ":" only');
const layer = z.enum(LAYER_IDS, { error: enumError('layer', LAYER_IDS) });
// YAML turns "version: 1.31" into a number; metadata is always displayed as text.
const meta = z.record(z.string(), z.coerce.string()).optional();

const scoped = { since: id.optional(), until: id.optional() };

const groupOverride = z.strictObject({
  label: z.string().optional(),
  parent: id.optional(),
  meta,
  why: z.string().optional(),
});

const nodeOverride = z.strictObject({
  label: z.string().optional(),
  product: z.coerce.string().optional(),
  replicas: z.number().int().positive().optional(),
  why: z.string().optional(),
  group: id.optional(),
  meta,
});

const edgeStyle = z.enum(['solid', 'dashed'], { error: enumError('style', ['solid', 'dashed']) });

const edgeOverride = z.strictObject({
  label: z.coerce.string().optional(),
  protocol: z.coerce.string().optional(),
  why: z.string().optional(),
  style: edgeStyle.optional(),
});

const group = z.strictObject({
  id,
  label: z.string(),
  kind: z.enum(GROUP_KINDS, { error: enumError('group kind', GROUP_KINDS) }),
  layer,
  parent: id.optional(),
  meta,
  why: z.string().optional(),
  ...scoped,
  at: z.record(id, groupOverride).optional(),
});

const node = z.strictObject({
  id,
  label: z.string(),
  type: z.enum(NODE_TYPE_IDS, { error: enumError('node type', NODE_TYPE_IDS) }),
  product: z.coerce.string().optional(),
  layer,
  group: id.optional(),
  why: z.string().default(''),
  alternatives: z.array(z.coerce.string()).optional(),
  meta,
  replicas: z.number().int().positive().optional(),
  ...scoped,
  at: z.record(id, nodeOverride).optional(),
});

const edge = z.strictObject({
  id: id.optional(),
  from: id,
  to: id,
  label: z.coerce.string().optional(),
  protocol: z.coerce.string().optional(),
  layer,
  why: z.string().optional(),
  style: edgeStyle.optional(),
  ...scoped,
  at: z.record(id, edgeOverride).optional(),
});

const stage = z.strictObject({
  id,
  label: z.string(),
  scale: z.coerce.string().optional(),
  summary: z.string().default(''),
});

const traceStep = z.strictObject({ from: id, to: id, note: z.string() });

const trace = z.strictObject({
  id,
  name: z.string(),
  description: z.string().optional(),
  steps: z.array(traceStep),
});

/** Shape of an architecture document as users write it. `layers` may be omitted. */
export const architectureSchema = z.strictObject({
  id,
  name: z.string(),
  description: z.string().default(''),
  scale: z.coerce.string().optional(),
  tags: z.array(z.coerce.string()).optional(),
  layers: z.array(layer).optional(),
  groups: z.array(group).default([]),
  nodes: z.array(node).default([]),
  edges: z.array(edge).default([]),
  traces: z.array(trace).optional(),
  stages: z.array(stage).optional(),
});

export type ArchitectureInput = z.infer<typeof architectureSchema>;
export { LAYER_IDS, NODE_TYPE_IDS };
