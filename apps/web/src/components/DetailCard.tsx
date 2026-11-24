import { useEffect } from 'react';
import { useStagedView } from '../store/useStagedView';
import { NODE_TYPES } from '@atlas/shared';
import { LAYERS } from '@atlas/shared';
import { isDraftBackedState, useAtlasStore } from '../store/useAtlasStore';
import { Inspector } from './Inspector';

export function DetailCard() {
  const selectedId = useAtlasStore((s) => s.selectedId);
  const select = useAtlasStore((s) => s.select);
  const isDraft = useAtlasStore((s) => isDraftBackedState(s));
  const appMode = useAtlasStore((s) => s.appMode);
  const view = useStagedView();

  // Escape key closes reading sheet
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  if (!view || !selectedId) return null;
  const arch = view.arch;

  const node = arch.nodes.find((n) => n.id === selectedId);
  const group = arch.groups.find((g) => g.id === selectedId);

  // When editing in Build mode on user's draft, render form-based Inspector
  if (isDraft && appMode === 'build' && (node || group)) {
    return <Inspector />;
  }

  if (group) {
    return (
      <aside className="placard-sheet" role="complementary" aria-label={`Perimeter ${group.label} details`}>
        <div className="placard-header">
          <div className="placard-eyebrow tabular">
            <span>PERIMETER BOUNDARY</span>
            <span className="eyebrow-sep">/</span>
            <span>{group.kind.toUpperCase()}</span>
          </div>
          <button className="placard-close-btn" onClick={() => select(null)} title="Close sheet (Esc)">
            <span className="key-hint">ESC</span>
            <span className="close-x">×</span>
          </button>
        </div>

        <h2 className="placard-title">{group.label}</h2>
        <div className="placard-subtitle">{LAYERS[group.layer].label} Layer</div>

        {group.why && (
          <section className="placard-monograph">
            <h4 className="placard-section-title">Architectural Rationale</h4>
            <p className="placard-why-text">{group.why}</p>
          </section>
        )}

        {group.meta && Object.keys(group.meta).length > 0 && (
          <section className="placard-section">
            <h4 className="placard-section-title">Technical Specifications</h4>
            <dl className="placard-specs-grid">
              {Object.entries(group.meta).map(([k, v]) => (
                <div key={k} className="spec-row">
                  <dt className="spec-key">{k}</dt>
                  <dd className="spec-value tabular">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </aside>
    );
  }

  if (!node) return null;

  const n = node;
  const info = NODE_TYPES[n.type];
  const inbound = arch.edges.filter((e) => e.to === n.id);
  const outbound = arch.edges.filter((e) => e.from === n.id);
  const label = (id: string) => arch.nodes.find((x) => x.id === id)?.label ?? id;

  return (
    <aside className="placard-sheet" role="complementary" aria-label={`Component ${n.label} details`}>
      <div className="placard-header">
        <div className="placard-eyebrow tabular">
          <span>{info.label.toUpperCase()}</span>
          <span className="eyebrow-sep">/</span>
          <span>{LAYERS[n.layer].label.toUpperCase()} LAYER</span>
        </div>
        <button className="placard-close-btn" onClick={() => select(null)} title="Close sheet (Esc)">
          <span className="key-hint">ESC</span>
          <span className="close-x">×</span>
        </button>
      </div>

      <div className="placard-identity">
        <span className="placard-glyph">{info.glyph}</span>
        <div>
          <h2 className="placard-title">{n.label}</h2>
          <div className="placard-subtitle">
            {n.product ? `${n.product} · ` : ''}
            {info.description}
          </div>
        </div>
      </div>

      {/* Primary Museum Placard Monograph */}
      <section className="placard-monograph">
        <h4 className="placard-section-title">Architectural Rationale</h4>
        <p className="placard-why-text">{n.why}</p>
      </section>

      {/* Technical Specifications Sheet */}
      <section className="placard-section">
        <h4 className="placard-section-title">Technical Specifications</h4>
        <dl className="placard-specs-grid">
          <div className="spec-row">
            <dt className="spec-key">Type</dt>
            <dd className="spec-value">{info.label}</dd>
          </div>
          {n.product && (
            <div className="spec-row">
              <dt className="spec-key">Product</dt>
              <dd className="spec-value tabular">{n.product}</dd>
            </div>
          )}
          <div className="spec-row">
            <dt className="spec-key">Layer</dt>
            <dd className="spec-value">{LAYERS[n.layer].label}</dd>
          </div>
          {n.replicas && n.replicas > 1 && (
            <div className="spec-row">
              <dt className="spec-key">Replicas</dt>
              <dd className="spec-value tabular">×{n.replicas}</dd>
            </div>
          )}
          {n.meta &&
            Object.entries(n.meta).map(([k, v]) => (
              <div key={k} className="spec-row">
                <dt className="spec-key">{k}</dt>
                <dd className="spec-value tabular">{v}</dd>
              </div>
            ))}
        </dl>
      </section>

      {/* Upstream & Downstream Topology Paths */}
      {(inbound.length > 0 || outbound.length > 0) && (
        <section className="placard-section">
          <h4 className="placard-section-title">Topology Connections</h4>
          <ul className="placard-paths-list">
            {inbound.map((e, i) => (
              <li key={`in${i}`} className="path-item">
                <div className="path-line">
                  <span className="path-dir inbound">←</span>
                  <span className="path-node-name">{label(e.from)}</span>
                  {e.protocol && <code className="path-protocol tabular">{e.protocol}</code>}
                </div>
                {e.why && <div className="path-why">{e.why}</div>}
              </li>
            ))}
            {outbound.map((e, i) => (
              <li key={`out${i}`} className="path-item">
                <div className="path-line">
                  <span className="path-dir outbound">→</span>
                  <span className="path-node-name">{label(e.to)}</span>
                  {e.protocol && <code className="path-protocol tabular">{e.protocol}</code>}
                </div>
                {e.why && <div className="path-why">{e.why}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Considered Alternatives */}
      {n.alternatives && n.alternatives.length > 0 && (
        <section className="placard-section">
          <h4 className="placard-section-title">Considered Alternatives</h4>
          <div className="placard-chips">
            {n.alternatives.map((a) => (
              <span key={a} className="placard-chip">
                {a}
              </span>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
