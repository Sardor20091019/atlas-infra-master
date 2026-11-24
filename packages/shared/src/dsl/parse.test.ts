import { describe, expect, it } from 'vitest';
import { architectures } from '../architectures/index.js';
import { BLANK_TEMPLATE, formatYaml, locateItem, parseArchitectureText, toYaml } from './parse.js';

/** Line of the first diagnostic, with its text, for readable assertions. */
function first(text: string) {
  const { arch, diagnostics } = parseArchitectureText(text);
  const d = diagnostics[0];
  return { arch, d, snippet: d ? text.slice(d.from, d.to) : '' };
}

const base = `id: t
name: T
nodes:
  - id: a
    label: A
    type: service
    layer: services
    why: x
  - id: b
    label: B
    type: database
    layer: data
    why: y
edges:
  - { from: a, to: b, layer: data }
`;

describe('parseArchitectureText', () => {
  it.each(architectures.map((a) => [a.id, a] as const))('round-trips gallery architecture %s', (_, arch) => {
    const { arch: back, diagnostics } = parseArchitectureText(toYaml(arch));
    expect(diagnostics).toEqual([]);
    expect(back).toEqual(arch);
  });

  it('accepts the blank template without any diagnostics', () => {
    const { arch, diagnostics } = parseArchitectureText(BLANK_TEMPLATE);
    expect(diagnostics).toEqual([]);
    expect(arch?.nodes).toHaveLength(4);
  });

  it('derives layers from usage when omitted', () => {
    expect(parseArchitectureText(base).arch?.layers).toEqual(['services', 'data']);
  });

  it('reports YAML syntax errors with a position', () => {
    const { arch, d } = first('id: t\nname: [unclosed\n');
    expect(arch).toBeUndefined();
    expect(d.severity).toBe('error');
    expect(d.line).toBeGreaterThanOrEqual(2);
  });

  it('points an unknown node type at the offending value', () => {
    const { d, snippet } = first(base.replace('type: database', 'type: databse'));
    expect(d.message).toBe('Unknown node type "databse". Did you mean "database"? Press Ctrl+Space for the list.');
    expect(snippet).toBe('databse');
    expect(d.line).toBe(11);
  });

  it('points a dangling edge reference at the id', () => {
    const { arch, d, snippet } = first(base.replace('to: b', 'to: c'));
    expect(arch).toBeUndefined();
    expect(d.message).toBe('Node "c" does not exist');
    expect(snippet).toBe('c');
  });

  it('explains that edges cannot target groups', () => {
    const text = base.replace('nodes:', 'groups:\n  - { id: g, label: G, kind: vpc, layer: data }\nnodes:').replace('to: b', 'to: g');
    expect(first(text).d.message).toBe('"g" is a group; edges connect nodes');
  });

  it('flags unknown keys on the key itself', () => {
    const { d, snippet } = first(base.replace('    why: x', '    whyy: x'));
    expect(d.message).toBe('Unknown key "whyy"');
    expect(snippet).toBe('whyy');
  });

  it('flags missing required fields', () => {
    expect(first(base.replace('    label: A\n', '')).d.message).toBe('Missing required field "label"');
  });

  it('detects parent cycles instead of hanging', () => {
    const text = `id: t
name: T
groups:
  - { id: g1, label: G1, kind: vpc, layer: network, parent: g2 }
  - { id: g2, label: G2, kind: subnet, layer: network, parent: g1 }
`;
    const { arch, diagnostics } = parseArchitectureText(text);
    expect(arch).toBeUndefined();
    expect(diagnostics.some((d) => d.message.includes('parent cycle'))).toBe(true);
  });

  it('treats a missing why as a warning and still renders', () => {
    const { arch, diagnostics } = parseArchitectureText(base.replace('    why: y\n', ''));
    expect(arch).toBeDefined();
    expect(diagnostics.map((d) => d.severity)).toEqual(['warning']);
  });

  it('rejects trace steps that do not follow an edge', () => {
    const text = `${base}traces:\n  - id: r\n    name: R\n    steps:\n      - { from: b, to: a, note: back }\n`;
    expect(first(text).d.message).toMatch(/No edge b → a/);
  });

  it('coerces numeric metadata to strings', () => {
    const text = base.replace('    why: x', '    why: x\n    meta: { version: 1.31 }');
    expect(parseArchitectureText(text).arch?.nodes[0].meta).toEqual({ version: '1.31' });
  });
});

describe('editor helpers', () => {
  it('locates a node definition by id', () => {
    const range = locateItem(base, 'b');
    expect(range && base.slice(range[0], range[1])).toBe('id: b');
  });

  it('formats while keeping comments', () => {
    const out = formatYaml('# keep me\nid:    t\nname: T\n');
    expect(out).toBe('# keep me\nid: t\nname: T\n');
  });
});

describe('enum hints', () => {
  it('omits the hint when nothing is close', () => {
    const { d } = first(base.replace('type: database', 'type: zzzzzzzz'));
    expect(d.message).toBe('Unknown node type "zzzzzzzz". Press Ctrl+Space for the list.');
  });

  it('keeps "missing field" wording for an absent enum', () => {
    expect(first(base.replace('    layer: data\n', '')).d.message).toBe('Missing required field "layer"');
  });
});
