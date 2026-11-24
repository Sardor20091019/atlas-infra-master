import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GROUP_KINDS, LAYERS, type Group, type InfraNode, type LayerId, type NodeType } from '../dsl/types';
import { GROUP_KIND_INFO, NODE_TYPES } from '../dsl/vocabulary';
import { LAYER_IDS, NODE_TYPE_IDS } from '../dsl/schema';
import { deleteEdge, deleteItem, renameId, setField, type GroupField, type NodeField } from '../dsl/edit';
import { useAtlasStore } from '../store/useAtlasStore';
import { useStagedView } from '../store/useStagedView';
import { useCanEdit } from '../store/useCanEdit';

/** How long typing pauses before a text field is written to the YAML. */
const TYPING_COMMIT_MS = 500;

/**
 * Text input that keeps its own value while focused, so a slow round trip
 * through YAML → parse never overwrites what the user is typing.
 */
function useLocalValue(value: string, onCommit: (v: string) => void, live: boolean) {
  const [local, setLocal] = useState(value);
  const focused = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!focused.current) setLocal(value);
  }, [value]);

  const flush = (v: string) => {
    window.clearTimeout(timer.current);
    if (v !== value) onCommit(v);
  };
  return {
    value: local,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      flush(local);
    },
    onChange: (v: string) => {
      setLocal(v);
      if (!live) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => flush(v), TYPING_COMMIT_MS);
    },
    reset: () => setLocal(value),
  };
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="insp-row" title={hint}>
      <span className="insp-label">{label}</span>
      {children}
    </label>
  );
}

function TextField(props: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  live?: boolean;
  disabled?: boolean;
}) {
  const f = useLocalValue(props.value, props.onCommit, props.live ?? true);
  const common = {
    value: f.value,
    placeholder: props.placeholder,
    disabled: props.disabled,
    onFocus: f.onFocus,
    onBlur: f.onBlur,
  };
  if (props.multiline) {
    return <textarea {...common} rows={4} onChange={(e) => f.onChange(e.target.value)} />;
  }
  return (
    <input
      {...common}
      onChange={(e) => f.onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          f.reset();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function SelectField<T extends string>(props: {
  value: T | '';
  options: { value: T | ''; label: string }[];
  onCommit: (v: T | '') => void;
  disabled?: boolean;
}) {
  return (
    <select value={props.value} disabled={props.disabled} onChange={(e) => props.onCommit(e.target.value as T | '')}>
      {props.options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

const metaToText = (meta?: Record<string, string>) =>
  Object.entries(meta ?? {})
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

function textToMeta(text: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    if (key) out[key] = line.slice(i + 1).trim();
  }
  return Object.keys(out).length ? out : undefined;
}

/** Editable card for the selected node or group of the draft. */
export function Inspector() {
  const view = useStagedView();
  const selectedId = useAtlasStore((s) => s.selectedId);
  const runEdit = useAtlasStore((s) => s.runEdit);
  const select = useAtlasStore((s) => s.select);
  const { canEdit, reason } = useCanEdit();
  if (!view || !selectedId) return null;

  const { arch, stage, index } = view;
  const node = arch.nodes.find((n) => n.id === selectedId);
  const group = arch.groups.find((g) => g.id === selectedId);
  const item = node ?? group;
  if (!item) return null;

  const set = (field: NodeField | GroupField, value: unknown) =>
    runEdit((text, ctx) => setField(text, ctx, item.id, field, value), `${item.id}:${field}`);
  const rename = (next: string) => runEdit((text) => renameId(text, item.id, next.trim()));
  const remove = () => runEdit((text, ctx) => deleteItem(text, ctx, item.id));

  // Boxes this item may be put into: never itself or one of its own descendants.
  const descendants = new Set<string>([item.id]);
  if (group) {
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of arch.groups) {
        if (g.parent && descendants.has(g.parent) && !descendants.has(g.id)) {
          descendants.add(g.id);
          grew = true;
        }
      }
    }
  }
  const parentOptions = [
    { value: '' as string, label: '(top level)' },
    ...arch.groups.filter((g) => !descendants.has(g.id)).map((g) => ({ value: g.id, label: g.label })),
  ];
  const layerOptions = LAYER_IDS.map((l) => ({ value: l, label: LAYERS[l].label }));
  const label = (id: string) => arch.nodes.find((x) => x.id === id)?.label ?? id;

  const info = node ? NODE_TYPES[node.type] : undefined;

  return (
    // Remount per item so local field state never leaks between selections.
    <aside className="panel detail-card inspector" key={item.id}>
      <div className="panel-title">
        {node ? (
          <span
            className="glyph"
            style={{
              background: `${info?.color ?? '#64748b'}18`,
              borderColor: `${info?.color ?? '#64748b'}36`,
              color: info?.color,
            }}
          >
            {info?.glyph}
          </span>
        ) : (
          <span className="kind">{(item as Group).kind}</span>
        )}
        <span className="detail-title-text">{item.label}</span>
        <button className="close" onClick={() => select(null)} title="Close inspector (Esc)">
          ×
        </button>
      </div>

      {!canEdit && <p className="insp-note">{reason}</p>}
      {stage && index > 0 && (
        <p className="insp-note">
          Editing stage <b>{stage.label}</b>: changes apply from this stage on and earlier stages keep their values. Id,
          type, kind, and layer are shared by all stages.
        </p>
      )}

      <fieldset disabled={!canEdit} className="insp-fields">
        <Row label="Id" hint="Renaming updates every reference in edges, groups, and traces">
          <TextField value={item.id} onCommit={rename} live={false} />
        </Row>
        <Row label="Label">
          <TextField value={item.label} onCommit={(v) => v.trim() && set('label', v)} />
        </Row>

        {node && <NodeFields node={node} set={set} layerOptions={layerOptions} />}
        {group && (
          <>
            <Row label="Kind">
              <SelectField
                value={group.kind}
                options={GROUP_KINDS.map((k) => ({ value: k, label: GROUP_KIND_INFO[k].label }))}
                onCommit={(v) => v && set('kind', v)}
              />
            </Row>
            <Row label="Layer">
              <SelectField<LayerId> value={group.layer} options={layerOptions} onCommit={(v) => v && set('layer', v)} />
            </Row>
          </>
        )}

        <Row label={node ? 'Inside' : 'Parent'} hint="Perimeter box this component belongs to">
          <SelectField
            value={(node ? node.group : group?.parent) ?? ''}
            options={parentOptions}
            onCommit={(v) => set(node ? 'group' : 'parent', v || undefined)}
          />
        </Row>
        <Row label="Why" hint="Why this component is here. This is what makes the diagram useful.">
          <TextField value={item.why ?? ''} onCommit={(v) => set('why', v)} multiline placeholder="Architectural rationale..." />
        </Row>
        <Row label="Meta" hint="One key: value per line, e.g. cidr: 10.0.0.0/16">
          <TextField
            value={metaToText(item.meta)}
            onCommit={(v) => set('meta', textToMeta(v))}
            multiline
            placeholder={'cidr: 10.0.0.0/16\nzone: private'}
          />
        </Row>
      </fieldset>

      {node && (
        <section>
          <h4>Topology Connections</h4>
          <ul className="edges">
            {arch.edges
              .filter((e) => e.from === node.id || e.to === node.id)
              .map((e) => (
                <li key={`${e.from}->${e.to}`} className="insp-edge">
                  <span>
                    {e.from === node.id ? (
                      <>
                        <span className="dir">→</span> <b>{label(e.to)}</b>
                      </>
                    ) : (
                      <>
                        <span className="dir">←</span> <b>{label(e.from)}</b>
                      </>
                    )}
                    {e.protocol && <code>{e.protocol}</code>}
                  </span>
                  {canEdit && (
                    <button
                      className="insp-x"
                      title="Remove this connection"
                      onClick={() => runEdit((text, ctx) => deleteEdge(text, ctx, e.from, e.to))}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
          </ul>
          {canEdit && <p className="muted small" style={{ marginTop: 6 }}>Drag from the dot under a component to add a connection.</p>}
        </section>
      )}

      {canEdit && (
        <button className="insp-delete" onClick={remove}>
          {stage && index > 0 && item.since !== stage.id ? `Remove from "${stage.label}" on` : `Delete ${node ? 'component' : 'box'}`}
        </button>
      )}
    </aside>
  );
}

function NodeFields({
  node,
  set,
  layerOptions,
}: {
  node: InfraNode;
  set: (field: NodeField, value: unknown) => boolean;
  layerOptions: { value: LayerId; label: string }[];
}) {
  const runEdit = useAtlasStore((s) => s.runEdit);
  // Changing the type also swaps a still-default label, in a single undo step.
  const setType = (next: NodeType) =>
    runEdit((text, ctx) => {
      let r = setField(text, ctx, node.id, 'type', next);
      if (node.label === NODE_TYPES[node.type].label) r = setField(r.text, ctx, node.id, 'label', NODE_TYPES[next].label);
      return r;
    });
  return (
    <>
      <Row label="Type">
        <SelectField<NodeType>
          value={node.type}
          options={NODE_TYPE_IDS.map((t) => ({ value: t, label: `${NODE_TYPES[t].glyph} ${NODE_TYPES[t].label}` }))}
          onCommit={(v) => v && setType(v)}
        />
      </Row>
      <Row label="Product" hint='Concrete product or implementation, e.g. "PostgreSQL 16"'>
        <TextField value={node.product ?? ''} onCommit={(v) => set('product', v)} placeholder="e.g. PostgreSQL 16" />
      </Row>
      <Row label="Layer">
        <SelectField<LayerId> value={node.layer} options={layerOptions} onCommit={(v) => v && set('layer', v)} />
      </Row>
      <Row label="Replicas">
        <TextField
          value={node.replicas ? String(node.replicas) : ''}
          onCommit={(v) => {
            const n = Number.parseInt(v, 10);
            set('replicas', Number.isFinite(n) && n > 1 ? n : undefined);
          }}
          placeholder="1"
        />
      </Row>
      <Row label="Alternatives" hint="Comma-separated evaluated alternatives">
        <TextField
          value={(node.alternatives ?? []).join(', ')}
          onCommit={(v) => {
            const list = v.split(',').map((x) => x.trim()).filter(Boolean);
            set('alternatives', list.length ? list : undefined);
          }}
          placeholder="e.g. MySQL, CockroachDB"
        />
      </Row>
    </>
  );
}
