import { isMap, isScalar, isSeq, parseDocument, type Document, type YAMLMap, type YAMLSeq } from 'yaml';
import { LAYERS, type GroupKind, type LayerId, type NodeType } from './types.js';
import { DEFAULT_NODE_LAYER, GROUP_KIND_INFO, NODE_TYPES } from './vocabulary.js';

/**
 * Visual-editor operations. Each takes the draft YAML text and returns new
 * text, editing the YAML document in place so comments and formatting the
 * user wrote by hand survive.
 *
 * Stage rule: at the first stage (or without stages) edits change base
 * values. At a later stage they become `at: <stage>` overrides, additions get
 * `since: <stage>`, and deletions set `until` to the previous stage, so the
 * earlier stages stay exactly as they were.
 */

export interface EditContext {
  stageIndex: number;
}

export interface EditResult {
  text: string;
  /** Id to select after the edit; null clears the selection. */
  select?: string | null;
  /** Short explanation shown to the user, e.g. when a deletion became `until`. */
  message?: string;
}

/** A refused edit; the message is shown to the user as is. */
export class EditError extends Error {}

const ID_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const LAYER_ORDER = Object.keys(LAYERS) as LayerId[];

type Collection = 'nodes' | 'groups' | 'edges' | 'traces';

function load(text: string): Document {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new EditError('Fix the YAML syntax errors first.');
  if (!isMap(doc.contents)) throw new EditError('The document must be a map with id, name and nodes.');
  return doc;
}

function save(doc: Document): string {
  return doc.toString({ lineWidth: 0 });
}

function seqOf(doc: Document, key: Collection, create = false): YAMLSeq | undefined {
  const s = doc.get(key, true);
  if (isSeq(s)) return s;
  if (!create) return undefined;
  const fresh = doc.createNode([]) as YAMLSeq;
  doc.set(key, fresh);
  return fresh;
}

function mapsOf(doc: Document, key: Collection): YAMLMap[] {
  return (seqOf(doc, key)?.items ?? []).filter((i): i is YAMLMap => isMap(i));
}

function str(map: YAMLMap, key: string): string | undefined {
  const v = map.get(key);
  return typeof v === 'string' ? v : v == null ? undefined : String(v);
}

function find(doc: Document, id: string): { map: YAMLMap; collection: 'nodes' | 'groups' } | undefined {
  for (const collection of ['nodes', 'groups'] as const) {
    const map = mapsOf(doc, collection).find((m) => str(m, 'id') === id);
    if (map) return { map, collection };
  }
  return undefined;
}

function allIds(doc: Document): Set<string> {
  return new Set([...mapsOf(doc, 'nodes'), ...mapsOf(doc, 'groups')].map((m) => str(m, 'id') ?? ''));
}

function uniqueId(doc: Document, base: string): string {
  const taken = allIds(doc);
  const clean = base.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
  if (!taken.has(clean)) return clean;
  for (let n = 2; ; n++) if (!taken.has(`${clean}-${n}`)) return `${clean}-${n}`;
}

function stageIds(doc: Document): string[] {
  const stages = doc.get('stages', true);
  return isSeq(stages) ? stages.items.filter(isMap).map((m) => str(m as YAMLMap, 'id') ?? '') : [];
}

/** The stage id edits should be recorded against, or undefined for base edits. */
function laterStage(doc: Document, ctx: EditContext): { id: string; previous: string } | undefined {
  const ids = stageIds(doc);
  if (ctx.stageIndex <= 0 || ctx.stageIndex >= ids.length) return undefined;
  return { id: ids[ctx.stageIndex], previous: ids[ctx.stageIndex - 1] };
}

/** Add a layer to an explicit `layers` list, keeping the canonical order. */
function ensureLayer(doc: Document, layer: LayerId): void {
  const layers = doc.get('layers', true);
  if (!isSeq(layers)) return; // Layers are derived from usage when the list is omitted.
  const present = new Set(layers.items.map((i) => (isScalar(i) ? String(i.value) : '')));
  if (present.has(layer)) return;
  present.add(layer);
  const next = doc.createNode(LAYER_ORDER.filter((l) => present.has(l))) as YAMLSeq;
  next.flow = true;
  doc.set('layers', next);
}

function isGroupDescendant(doc: Document, candidate: string, ancestor: string): boolean {
  const parentOf = new Map(mapsOf(doc, 'groups').map((g) => [str(g, 'id'), str(g, 'parent')]));
  const seen = new Set<string>();
  let cur: string | undefined = candidate;
  while (cur !== undefined && !seen.has(cur)) {
    if (cur === ancestor) return true;
    seen.add(cur);
    cur = parentOf.get(cur);
  }
  return false;
}

/** The map under `key`, created (empty) when missing. */
function childMap(doc: Document, parent: YAMLMap, key: string, flow: boolean): YAMLMap {
  const existing: unknown = parent.get(key, true);
  if (isMap(existing)) return existing;
  const fresh = doc.createNode({}) as YAMLMap;
  fresh.flow = flow;
  parent.set(key, fresh);
  return fresh;
}

/** Write a field either on the item itself or as an `at` override for the current stage. */
function writeField(doc: Document, map: YAMLMap, field: string, value: unknown, ctx: EditContext, overridable: boolean): void {
  const stage = overridable ? laterStage(doc, ctx) : undefined;
  if (!stage) {
    if (value === undefined) map.delete(field);
    else map.set(field, doc.createNode(value));
    return;
  }
  const at = childMap(doc, map, 'at', false);
  const patch = childMap(doc, at, stage.id, true);
  if (value === undefined) patch.delete(field);
  else patch.set(field, doc.createNode(value));
  if (patch.items.length === 0) at.delete(stage.id);
  if (at.items.length === 0) map.delete('at');
}

/** Insert `key` right after `afterKey` so new fields land where a human would put them. */
function setAfter(doc: Document, map: YAMLMap, key: string, value: unknown, afterKey: string): void {
  map.delete(key);
  const index = map.items.findIndex((p) => isScalar(p.key) && p.key.value === afterKey);
  const pair = doc.createPair(key, value);
  if (index < 0) map.items.push(pair);
  else map.items.splice(index + 1, 0, pair);
}

// ---------------------------------------------------------------------------

export function addNode(text: string, ctx: EditContext, opts: { type: NodeType; group?: string }): EditResult {
  const doc = load(text);
  if (opts.group !== undefined && !find(doc, opts.group)) throw new EditError(`Group "${opts.group}" does not exist.`);
  const info = NODE_TYPES[opts.type];
  const layer = DEFAULT_NODE_LAYER[opts.type];
  const id = uniqueId(doc, opts.type);
  const stage = laterStage(doc, ctx);
  const item: Record<string, unknown> = { id, label: info.label, type: opts.type, layer };
  if (opts.group !== undefined) item.group = opts.group;
  if (stage) item.since = stage.id;
  seqOf(doc, 'nodes', true)!.add(doc.createNode(item));
  ensureLayer(doc, layer);
  return { text: save(doc), select: id };
}

export function addGroup(text: string, ctx: EditContext, opts: { kind: GroupKind; parent?: string }): EditResult {
  const doc = load(text);
  if (opts.parent !== undefined && find(doc, opts.parent)?.collection !== 'groups') {
    throw new EditError(`Group "${opts.parent}" does not exist.`);
  }
  const info = GROUP_KIND_INFO[opts.kind];
  const id = uniqueId(doc, opts.kind);
  const stage = laterStage(doc, ctx);
  const item: Record<string, unknown> = { id, label: `New ${info.label.toLowerCase()}`, kind: opts.kind, layer: info.layer };
  if (opts.parent !== undefined) item.parent = opts.parent;
  if (stage) item.since = stage.id;
  seqOf(doc, 'groups', true)!.add(doc.createNode(item));
  ensureLayer(doc, info.layer);
  return { text: save(doc), select: id };
}

export function addEdge(text: string, ctx: EditContext, opts: { from: string; to: string }): EditResult {
  const doc = load(text);
  const { from, to } = opts;
  if (from === to) throw new EditError('A component cannot connect to itself.');
  const target = find(doc, to);
  if (find(doc, from)?.collection !== 'nodes' || target?.collection !== 'nodes') {
    throw new EditError('Edges connect components, not groups.');
  }
  if (mapsOf(doc, 'edges').some((e) => str(e, 'from') === from && str(e, 'to') === to)) {
    throw new EditError(`${from} → ${to} is already connected.`);
  }
  // Traffic is drawn on the layer of what it reaches: app → database is data traffic.
  const layer = (str(target.map, 'layer') as LayerId | undefined) ?? 'services';
  const stage = laterStage(doc, ctx);
  const item: Record<string, unknown> = { from, to, layer };
  if (stage) item.since = stage.id;
  const node = doc.createNode(item) as YAMLMap;
  node.flow = true;
  seqOf(doc, 'edges', true)!.add(node);
  return { text: save(doc) };
}

/** Put a node or group into another group (or at the top level when `parent` is undefined). */
export function moveItem(text: string, ctx: EditContext, id: string, parent: string | undefined): EditResult {
  const doc = load(text);
  const item = find(doc, id);
  if (!item) throw new EditError(`"${id}" does not exist.`);
  if (parent !== undefined && find(doc, parent)?.collection !== 'groups') throw new EditError(`Group "${parent}" does not exist.`);
  if (item.collection === 'groups' && parent !== undefined && isGroupDescendant(doc, parent, id)) {
    throw new EditError('A group cannot be moved inside itself.');
  }
  if (parent === undefined && laterStage(doc, ctx)) {
    throw new EditError('At a later stage, items can only move into another group. Switch to the first stage to take it out of all groups.');
  }
  writeField(doc, item.map, item.collection === 'nodes' ? 'group' : 'parent', parent, ctx, true);
  return { text: save(doc), select: id };
}

const NODE_FIELDS = {
  label: true,
  product: true,
  replicas: true,
  why: true,
  group: true,
  meta: true,
  type: false,
  layer: false,
  alternatives: false,
} as const;
const GROUP_FIELDS = { label: true, parent: true, meta: true, why: true, kind: false, layer: false } as const;

export type NodeField = keyof typeof NODE_FIELDS;
export type GroupField = keyof typeof GROUP_FIELDS;

/**
 * Change one field. `undefined` removes optional fields. Fields marked `true`
 * above can differ per stage; the rest always change the base value.
 */
export function setField(text: string, ctx: EditContext, id: string, field: NodeField | GroupField, value: unknown): EditResult {
  const doc = load(text);
  const item = find(doc, id);
  if (!item) throw new EditError(`"${id}" does not exist.`);
  const fields: Record<string, boolean> = item.collection === 'nodes' ? NODE_FIELDS : GROUP_FIELDS;
  if (!(field in fields)) throw new EditError(`"${field}" cannot be edited here.`);
  if ((field === 'label' || field === 'type' || field === 'kind' || field === 'layer') && (value === undefined || value === '')) {
    throw new EditError(`"${field}" is required.`);
  }
  if (field === 'group' || field === 'parent') return moveItem(text, ctx, id, value as string | undefined);
  writeField(doc, item.map, field, value === '' ? undefined : value, ctx, fields[field]);
  if (field === 'layer') ensureLayer(doc, value as LayerId);
  return { text: save(doc), select: id };
}

/** Rename an id and every reference to it. */
export function renameId(text: string, oldId: string, newId: string): EditResult {
  const doc = load(text);
  if (oldId === newId) return { text, select: oldId };
  if (!ID_PATTERN.test(newId)) throw new EditError('Ids may contain letters, digits, "-", "_", "." and ":" only.');
  if (allIds(doc).has(newId)) throw new EditError(`"${newId}" is already used.`);
  const item = find(doc, oldId);
  if (!item) throw new EditError(`"${oldId}" does not exist.`);

  const swap = (map: YAMLMap, key: string) => {
    if (str(map, key) === oldId) map.set(key, newId);
  };
  item.map.set('id', newId);
  const overrides = (m: YAMLMap) => {
    const at = m.get('at', true);
    if (isMap(at)) for (const p of at.items) if (isMap(p.value)) (['group', 'parent'] as const).forEach((k) => swap(p.value as YAMLMap, k));
  };
  for (const n of mapsOf(doc, 'nodes')) {
    swap(n, 'group');
    overrides(n);
  }
  for (const g of mapsOf(doc, 'groups')) {
    swap(g, 'parent');
    overrides(g);
  }
  for (const e of mapsOf(doc, 'edges')) {
    swap(e, 'from');
    swap(e, 'to');
  }
  for (const t of mapsOf(doc, 'traces')) {
    const steps = t.get('steps', true);
    if (isSeq(steps)) for (const s of steps.items) if (isMap(s)) (['from', 'to'] as const).forEach((k) => swap(s, k));
  }
  return { text: save(doc), select: newId };
}

/** Drop trace steps matching `hit`; traces left without steps are removed. */
function pruneTraces(doc: Document, hit: (from?: string, to?: string) => boolean): void {
  const traces = seqOf(doc, 'traces');
  if (!traces) return;
  traces.items = traces.items.filter((t) => {
    if (!isMap(t)) return true;
    const steps = t.get('steps', true);
    if (!isSeq(steps)) return true;
    steps.items = steps.items.filter((s) => !(isMap(s) && hit(str(s, 'from'), str(s, 'to'))));
    return steps.items.length > 0;
  });
  if (traces.items.length === 0) doc.delete('traces');
}

export function deleteItem(text: string, ctx: EditContext, id: string): EditResult {
  const doc = load(text);
  const item = find(doc, id);
  if (!item) throw new EditError(`"${id}" does not exist.`);
  const label = str(item.map, 'label') ?? id;

  // Introduced at an earlier stage: retire it from this stage on instead of erasing history.
  const stage = laterStage(doc, ctx);
  if (stage && str(item.map, 'since') !== stage.id) {
    setAfter(doc, item.map, 'until', stage.previous, str(item.map, 'since') !== undefined ? 'since' : 'layer');
    return { text: save(doc), select: null, message: `"${label}" now ends at stage "${stage.previous}".` };
  }

  const list = seqOf(doc, item.collection)!;
  list.items = list.items.filter((m) => m !== item.map);

  if (item.collection === 'nodes') {
    const edges = seqOf(doc, 'edges');
    if (edges) edges.items = edges.items.filter((e) => !(isMap(e) && (str(e, 'from') === id || str(e, 'to') === id)));
    pruneTraces(doc, (from, to) => from === id || to === id);
    return { text: save(doc), select: null };
  }

  // Deleting a box keeps its contents: they move up to the box's parent.
  const parent = str(item.map, 'parent');
  const relink = (map: YAMLMap, key: string) => {
    if (str(map, key) !== id) return;
    if (parent === undefined) map.delete(key);
    else map.set(key, parent);
  };
  const relinkOverrides = (m: YAMLMap, key: string) => {
    const at = m.get('at', true);
    if (!isMap(at)) return;
    // Iterate over a copy: emptied overrides are deleted from `at` inside the loop.
    for (const p of at.items.slice()) {
      if (!isMap(p.value)) continue;
      relink(p.value, key);
      if (p.value.items.length === 0) at.delete(p.key);
    }
    if (at.items.length === 0) m.delete('at');
  };
  for (const n of mapsOf(doc, 'nodes')) {
    relink(n, 'group');
    relinkOverrides(n, 'group');
  }
  for (const g of mapsOf(doc, 'groups')) {
    relink(g, 'parent');
    relinkOverrides(g, 'parent');
  }
  return { text: save(doc), select: null };
}

export function deleteEdge(text: string, ctx: EditContext, from: string, to: string): EditResult {
  const doc = load(text);
  const edges = seqOf(doc, 'edges');
  const edge = edges?.items.find((e): e is YAMLMap => isMap(e) && str(e, 'from') === from && str(e, 'to') === to);
  if (!edges || !edge) throw new EditError(`No edge ${from} → ${to}.`);

  const stage = laterStage(doc, ctx);
  if (stage && str(edge, 'since') !== stage.id) {
    setAfter(doc, edge, 'until', stage.previous, str(edge, 'since') !== undefined ? 'since' : 'layer');
    return { text: save(doc), select: null, message: `${from} → ${to} now ends at stage "${stage.previous}".` };
  }
  edges.items = edges.items.filter((e) => e !== edge);
  pruneTraces(doc, (f, t) => f === from && t === to);
  return { text: save(doc), select: null };
}
