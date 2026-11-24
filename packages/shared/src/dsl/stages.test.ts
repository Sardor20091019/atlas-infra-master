import { describe, expect, it } from 'vitest';
import { webEvolution } from '../architectures/web-evolution.js';
import { simpleWebApp } from '../architectures/simple-web-app.js';
import { resolveStage } from './stages.js';
import { parseArchitectureText } from './parse.js';

const at = (i: number) => resolveStage(webEvolution, i);
const ids = (items: { id: string }[]) => items.map((x) => x.id).sort();

describe('resolveStage', () => {
  it('passes architectures without stages through untouched', () => {
    const view = resolveStage(simpleWebApp, 3);
    expect(view.arch).toBe(simpleWebApp);
    expect(view.stage).toBeUndefined();
  });

  it('shows only what exists at the first stage', () => {
    const { arch } = at(0);
    expect(ids(arch.nodes)).toEqual(['app', 'dns', 'lb', 'pg', 'user']);
    expect(arch.nodes.find((n) => n.id === 'pg')?.group).toBe('server-1');
  });

  it('applies overrides cumulatively', () => {
    const app = (i: number) => at(i).arch.nodes.find((n) => n.id === 'app')!;
    expect(app(2)).toMatchObject({ label: 'App servers', group: 'app-servers', replicas: 4 });
    // async only bumps replicas; label and group carry over from horizontal.
    expect(app(3)).toMatchObject({ label: 'App servers', group: 'app-servers', replicas: 8 });
    expect(app(4)).toMatchObject({ label: 'App pods', group: 'cluster', replicas: 40 });
  });

  it('strips stage fields from the resolved view', () => {
    for (const n of at(4).arch.nodes) {
      expect(n).not.toHaveProperty('at');
      expect(n).not.toHaveProperty('since');
    }
  });

  it('drops edges whose ends are gone', () => {
    const keys = at(4).arch.edges.map((e) => `${e.from}->${e.to}`);
    expect(keys).not.toContain('app->pg-replica');
    expect(keys).not.toContain('user->lb');
    expect(keys).toContain('waf->lb');
  });

  it('describes what changed between stages', () => {
    const { diff } = at(1);
    expect(ids(diff.addedNodes)).toEqual(['storage']);
    expect(diff.changedNodes).toEqual([{ id: 'pg', label: 'PostgreSQL', details: ['moved: VM: server-1 → VM: db-1'] }]);
    expect(diff.newIds.has('db-vm')).toBe(true);
  });

  it('reports removed nodes', () => {
    expect(ids(at(4).diff.removedNodes)).toEqual(['pg-replica']);
  });

  it('offers only traces whose every hop exists in the stage', () => {
    const traces = (i: number) => (at(i).arch.traces ?? []).map((t) => t.id);
    expect(traces(0)).toEqual(['page-load-early']);
    expect(traces(2)).toEqual(['page-load-early']);
    expect(traces(3)).toEqual(['page-load-async', 'background-job']);
    expect(traces(4)).toEqual(['page-load-platform', 'background-job']);
  });

  it('clamps out-of-range stage indexes', () => {
    expect(resolveStage(webEvolution, 99).index).toBe(4);
    expect(resolveStage(webEvolution, -1).index).toBe(0);
  });
});

const staged = (extra: string) => `id: t
name: T
stages:
  - { id: s1, label: One }
  - { id: s2, label: Two }
groups:
  - { id: g, label: G, kind: zone, layer: compute, since: s2 }
nodes:
  - { id: a, label: A, type: service, layer: services, why: x }
${extra}`;

describe('stage validation', () => {
  it('rejects unknown stage ids', () => {
    const { diagnostics } = parseArchitectureText(staged('  - { id: b, label: B, type: vm, layer: compute, why: y, since: s3 }'));
    expect(diagnostics[0].message).toBe('Stage "s3" does not exist');
  });

  it('rejects since/until without a stages list', () => {
    const text = 'id: t\nname: T\nnodes:\n  - { id: a, label: A, type: vm, layer: compute, why: x, since: s1 }\n';
    expect(parseArchitectureText(text).diagnostics[0].message).toBe('"since" needs a stages list');
  });

  it('rejects a node placed in a group before the group exists', () => {
    const text = staged('  - { id: b, label: B, type: vm, layer: compute, why: y, group: g }');
    const { arch, diagnostics } = parseArchitectureText(text);
    expect(arch).toBeUndefined();
    expect(diagnostics[0].message).toBe('In stage "s1", group "g" is not present');
    expect(text.slice(diagnostics[0].from, diagnostics[0].to)).toBe('g');
  });

  it('points at the override that moved a node into a missing group', () => {
    const text = staged('  - { id: b, label: B, type: vm, layer: compute, why: y, until: s1, at: { s1: { group: g } } }');
    const d = parseArchitectureText(text).diagnostics[0];
    expect(d.message).toBe('In stage "s1", group "g" is not present');
    expect(text.slice(d.from, d.to)).toBe('g');
  });

  it('accepts a node that joins the group in the same stage', () => {
    const { arch, diagnostics } = parseArchitectureText(staged('  - { id: b, label: B, type: vm, layer: compute, why: y, since: s2, group: g }'));
    expect(diagnostics).toEqual([]);
    expect(arch).toBeDefined();
  });

  it('rejects since after until', () => {
    const d = parseArchitectureText(staged('  - { id: b, label: B, type: vm, layer: compute, why: y, since: s2, until: s1 }')).diagnostics[0];
    expect(d.message).toBe('"since" comes after "until"');
  });
});
