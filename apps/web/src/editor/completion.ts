import type { CompletionContext, CompletionResult, Completion } from '@codemirror/autocomplete';
import { parse } from 'yaml';
import { GROUP_KINDS, LAYERS } from '@atlas/shared';
import { NODE_TYPES } from '@atlas/shared';
import { LAYER_IDS, NODE_TYPE_IDS } from '@atlas/shared';

const typeOptions: Completion[] = NODE_TYPE_IDS.map((t) => ({
  label: t,
  detail: `${NODE_TYPES[t].glyph} ${NODE_TYPES[t].label}`,
  info: NODE_TYPES[t].description,
  type: 'enum',
}));
const layerOptions: Completion[] = LAYER_IDS.map((l) => ({
  label: l,
  info: LAYERS[l].description,
  type: 'enum',
}));
const kindOptions: Completion[] = GROUP_KINDS.map((k) => ({ label: k, type: 'enum' }));
const styleOptions: Completion[] = [
  { label: 'solid', info: 'Primary request path', type: 'enum' },
  { label: 'dashed', info: 'Async, replication, egress or other secondary traffic', type: 'enum' },
];

interface Ids {
  groups: Completion[];
  nodes: Completion[];
  stages: Completion[];
}

/** Collect ids from the current text; tolerate half-typed documents. */
function collectIds(text: string): Ids {
  const pick = (list: unknown, type: string): Completion[] =>
    Array.isArray(list)
      ? list
          .filter((x): x is { id: string; label?: unknown } => typeof x?.id === 'string')
          .map((x) => ({ label: x.id, detail: typeof x.label === 'string' ? x.label : undefined, type }))
      : [];
  try {
    const data = parse(text) as { groups?: unknown; nodes?: unknown; stages?: unknown } | null;
    return {
      groups: pick(data?.groups, 'class'),
      nodes: pick(data?.nodes, 'variable'),
      stages: pick(data?.stages, 'constant'),
    };
  } catch {
    return { groups: [], nodes: [], stages: [] };
  }
}

/**
 * Value completion keyed by the field name before the cursor. Works in block
 * style ("  type: ") and in flow maps ("{ from: a, to: ").
 */
export function atlasCompletion(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = line.text.slice(0, ctx.pos - line.from);

  const inLayers = /layers\s*:\s*\[[^\]]*?([\w-]*)$/.exec(before);
  if (inLayers) return { from: ctx.pos - inLayers[1].length, options: layerOptions, validFor: /^[\w-]*$/ };

  const m = /(?:^|[\s{,-])(type|layer|kind|group|parent|from|to|style|since|until)\s*:\s*([\w.:-]*)$/.exec(before);
  if (!m) return null;
  const [, key, word] = m;
  if (!word && !ctx.explicit && !before.endsWith(' ')) return null;

  let options: Completion[];
  switch (key) {
    case 'type':
      options = typeOptions;
      break;
    case 'layer':
      options = layerOptions;
      break;
    case 'kind':
      options = kindOptions;
      break;
    case 'style':
      options = styleOptions;
      break;
    case 'since':
    case 'until':
      options = collectIds(ctx.state.doc.toString()).stages;
      break;
    case 'group':
    case 'parent':
      options = collectIds(ctx.state.doc.toString()).groups;
      break;
    default:
      options = collectIds(ctx.state.doc.toString()).nodes;
  }
  return { from: ctx.pos - word.length, options, validFor: /^[\w.:-]*$/ };
}
