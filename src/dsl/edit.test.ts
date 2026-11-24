import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { webEvolution } from '../architectures/web-evolution';
import { addEdge, addGroup, addNode, deleteEdge, deleteItem, EditError, moveItem, renameId, setField } from './edit';
import { BLANK_TEMPLATE, parseArchitectureText, toYaml } from './parse';
import { architectureAt } from './stages';

const base = { stageIndex: 0 };

/** Parse the result and fail loudly if the edit produced an invalid document. */
function valid(text: string) {
  const { arch, diagnostics } = parseArchitectureText(text);
  const errors = diagnostics.filter((d) => d.severity === 'error');
  expect(errors.map((e) => e.message)).toEqual([]);
  return arch!;
}

describe('formatting', () => {
  it('leaves hand-written YAML untouched outside the edited spot', () => {
    expect(parseDocument(BLANK_TEMPLATE).toString({ lineWidth: 0 })).toBe(BLANK_TEMPLATE);
    const { text } = addNode(BLANK_TEMPLATE, base, { type: 'cache' });
    const inserted = '    why: Primary store of record.\n  - id: cache\n    label: Cache\n    type: cache\n    layer: data\n';
    expect(text).toBe(BLANK_TEMPLATE.replace('    why: Primary store of record.\n', inserted));
  });
});

describe('add', () => {
  it('adds a node with a unique id, default label and layer', () => {
    const r1 = addNode(BLANK_TEMPLATE, base, { type: 'cache', group: 'private' });
    const r2 = addNode(r1.text, base, { type: 'cache' });
    expect([r1.select, r2.select]).toEqual(['cache', 'cache-2']);
    const node = valid(r1.text).nodes.find((n) => n.id === 'cache');
    expect(node).toMatchObject({ label: 'Cache', type: 'cache', layer: 'data', group: 'private' });
  });

  it('adds the layer to an explicit layers list in canonical order', () => {
    const { text } = addNode(BLANK_TEMPLATE, base, { type: 'monitoring' });
    expect(valid(text).layers).toEqual(['network', 'services', 'data', 'platform']);
    const { text: t2 } = addNode(BLANK_TEMPLATE, base, { type: 'user' });
    expect(valid(t2).layers[0]).toBe('physical');
  });

  it('adds a group inside another group', () => {
    const { text, select } = addGroup(BLANK_TEMPLATE, base, { kind: 'cluster', parent: 'private' });
    expect(select).toBe('cluster');
    expect(valid(text).groups.find((g) => g.id === 'cluster')).toMatchObject({ parent: 'private', layer: 'compute' });
  });

  it('connects nodes on the layer of the target, in flow style', () => {
    const { text } = addEdge(BLANK_TEMPLATE, base, { from: 'user', to: 'db' });
    expect(text).toContain('- { from: user, to: db, layer: data }');
    valid(text);
  });

  it('refuses self, duplicate and group connections', () => {
    expect(() => addEdge(BLANK_TEMPLATE, base, { from: 'app', to: 'app' })).toThrow(EditError);
    expect(() => addEdge(BLANK_TEMPLATE, base, { from: 'lb', to: 'app' })).toThrow('already connected');
    expect(() => addEdge(BLANK_TEMPLATE, base, { from: 'app', to: 'vpc' })).toThrow('not groups');
  });

  it('creates missing collections', () => {
    const { text } = addNode('id: t\nname: T\n', base, { type: 'vm' });
    expect(valid(text).nodes).toHaveLength(1);
  });

  it('refuses to edit text with syntax errors', () => {
    expect(() => addNode('id: [oops\n', base, { type: 'vm' })).toThrow('syntax');
  });
});

describe('move, set, rename', () => {
  it('moves nodes and groups between groups', () => {
    const t1 = moveItem(BLANK_TEMPLATE, base, 'db', 'public').text;
    expect(valid(t1).nodes.find((n) => n.id === 'db')?.group).toBe('public');
    const t2 = moveItem(BLANK_TEMPLATE, base, 'app', undefined).text;
    expect(valid(t2).nodes.find((n) => n.id === 'app')?.group).toBeUndefined();
  });

  it('refuses to move a group into its own descendant', () => {
    expect(() => moveItem(BLANK_TEMPLATE, base, 'vpc', 'private')).toThrow('inside itself');
  });

  it('sets and clears optional fields', () => {
    let { text } = setField(BLANK_TEMPLATE, base, 'app', 'product', 'Go');
    text = setField(text, base, 'app', 'replicas', 6).text;
    text = setField(text, base, 'app', 'meta', { cpu: '2' }).text;
    expect(valid(text).nodes.find((n) => n.id === 'app')).toMatchObject({ product: 'Go', replicas: 6, meta: { cpu: '2' } });
    text = setField(text, base, 'app', 'product', '').text;
    expect(valid(text).nodes.find((n) => n.id === 'app')?.product).toBeUndefined();
  });

  it('refuses to clear required fields', () => {
    expect(() => setField(BLANK_TEMPLATE, base, 'app', 'label', '')).toThrow('required');
  });

  it('renames an id everywhere it is referenced', () => {
    const { text, select } = renameId(BLANK_TEMPLATE, 'private', 'app-subnet');
    expect(select).toBe('app-subnet');
    const arch = valid(text);
    expect(arch.nodes.filter((n) => n.group === 'app-subnet').map((n) => n.id)).toEqual(['app', 'db']);
    const t2 = renameId(BLANK_TEMPLATE, 'db', 'postgres').text;
    const arch2 = valid(t2);
    expect(arch2.edges.some((e) => e.to === 'postgres')).toBe(true);
    expect(arch2.traces?.[0].steps.at(-1)?.to).toBe('postgres');
  });

  it('refuses invalid or taken ids', () => {
    expect(() => renameId(BLANK_TEMPLATE, 'db', 'app')).toThrow('already used');
    expect(() => renameId(BLANK_TEMPLATE, 'db', 'my db')).toThrow('Ids may contain');
  });
});

describe('delete', () => {
  it('deletes a node with its edges and trace steps', () => {
    const arch = valid(deleteItem(BLANK_TEMPLATE, base, 'db').text);
    expect(arch.nodes.map((n) => n.id)).toEqual(['user', 'lb', 'app']);
    expect(arch.edges.some((e) => e.to === 'db')).toBe(false);
    expect(arch.traces?.[0].steps).toHaveLength(2);
  });

  it('removes traces that lose every step', () => {
    let text = BLANK_TEMPLATE;
    for (const id of ['lb', 'db']) text = deleteItem(text, base, id).text;
    expect(valid(text).traces).toBeUndefined();
  });

  it('keeps the contents of a deleted group by moving them up', () => {
    const arch = valid(deleteItem(BLANK_TEMPLATE, base, 'private').text);
    expect(arch.nodes.find((n) => n.id === 'app')?.group).toBe('vpc');
    const arch2 = valid(deleteItem(BLANK_TEMPLATE, base, 'vpc').text);
    expect(arch2.groups.find((g) => g.id === 'public')?.parent).toBeUndefined();
  });

  it('deletes a single edge', () => {
    const arch = valid(deleteEdge(BLANK_TEMPLATE, base, 'app', 'db').text);
    expect(arch.edges).toHaveLength(2);
    expect(arch.traces?.[0].steps).toHaveLength(2);
  });
});

describe('editing at a later stage', () => {
  const evo = toYaml(webEvolution);
  const atAsync = { stageIndex: 3 };

  it('marks additions with since', () => {
    const { text } = addNode(evo, atAsync, { type: 'search', group: 'data-tier' });
    const arch = valid(text);
    expect(arch.nodes.find((n) => n.id === 'search')?.since).toBe('async');
    expect(architectureAt(arch, 2).nodes.some((n) => n.id === 'search')).toBe(false);
    expect(architectureAt(arch, 3).nodes.some((n) => n.id === 'search')).toBe(true);
  });

  it('records field changes as overrides so earlier stages keep their values', () => {
    const arch = valid(setField(evo, atAsync, 'redis', 'product', 'Valkey 8').text);
    expect(architectureAt(arch, 2).nodes.find((n) => n.id === 'redis')?.product).toBe('Redis 7');
    expect(architectureAt(arch, 3).nodes.find((n) => n.id === 'redis')?.product).toBe('Valkey 8');
    // The platform stage sets its own product and still wins there.
    expect(architectureAt(arch, 4).nodes.find((n) => n.id === 'redis')?.product).toBe('Redis 7 + Sentinel');
  });

  it('records moves as overrides', () => {
    const arch = valid(moveItem(evo, atAsync, 'monitoring', 'data-tier').text);
    expect(arch.nodes.find((n) => n.id === 'monitoring')?.at?.async?.group).toBe('data-tier');
  });

  it('retires older items with until instead of deleting them', () => {
    const r = deleteItem(evo, atAsync, 'redis');
    expect(r.message).toMatch(/ends at stage "horizontal"/);
    const arch = valid(r.text);
    expect(architectureAt(arch, 2).nodes.some((n) => n.id === 'redis')).toBe(true);
    expect(architectureAt(arch, 3).nodes.some((n) => n.id === 'redis')).toBe(false);
  });

  it('really deletes items introduced at the current stage', () => {
    const arch = valid(deleteItem(evo, atAsync, 'pgbouncer').text);
    expect(arch.nodes.some((n) => n.id === 'pgbouncer')).toBe(false);
  });

  it('retires older edges with until', () => {
    const arch = valid(deleteEdge(evo, { stageIndex: 2 }, 'app', 'redis').text);
    expect(architectureAt(arch, 2).edges.some((e) => e.from === 'app' && e.to === 'redis')).toBe(false);
    expect(arch.edges.find((e) => e.from === 'app' && e.to === 'redis')?.until).toBe('separate-db');
  });
});
