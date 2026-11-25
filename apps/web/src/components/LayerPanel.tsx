import { LAYERS, type LayerId } from '@atlas/shared';
import { useArchitecture } from '../store/useArchitecture';
import { useAtlasStore } from '../store/useAtlasStore';

/**
 * Single-click layer visibility toggles inside the left workbench rail.
 */
export function LayerPanel() {
  const active = useAtlasStore((s) => s.activeLayers);
  const toggle = useAtlasStore((s) => s.toggleLayer);
  const setAll = useAtlasStore((s) => s.setAllLayers);
  const arch = useArchitecture();
  if (!arch) return null;

  const layerCounts = arch.layers.reduce(
    (acc, id) => {
      const nodes = arch.nodes.filter((n) => n.layer === id).length;
      const groups = arch.groups.filter((g) => g.layer === id).length;
      acc[id] = nodes + groups;
      return acc;
    },
    {} as Record<LayerId, number>,
  );

  return (
    <section className="rail-section" aria-label="Layer Visibility Controls">
      <div className="rail-section-head">
        <span className="rail-section-title">Layers</span>
        <span className="rail-section-actions">
          <button
            type="button"
            className="rail-text-btn"
            onClick={() => setAll(arch.layers)}
            title="Show all layers"
          >
            All
          </button>
          <span className="rail-text-sep" aria-hidden="true">
            /
          </span>
          <button
            type="button"
            className="rail-text-btn"
            onClick={() => setAll([])}
            title="Hide all layers"
          >
            None
          </button>
        </span>
      </div>

      <div className="layer-toggle-list" role="group" aria-label="Toggle visible layers">
        {arch.layers.map((id) => {
          const layer = LAYERS[id];
          const on = active.has(id);
          const count = layerCounts[id] ?? 0;
          return (
            <button
              key={id}
              type="button"
              role="switch"
              aria-checked={on}
              className={`layer-toggle-row${on ? ' on' : ''}`}
              onClick={() => toggle(id)}
              title={layer.description}
            >
              <span className="layer-eye" aria-hidden="true">
                {on ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8s-2.3 4.5-6.5 4.5S1.5 8 1.5 8Z"
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="8" cy="8" r="2" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M2 2l12 12M6.6 6.7A2 2 0 0 0 9.3 9.4M4.3 4.5C2.7 5.6 1.5 8 1.5 8s2.3 4.5 6.5 4.5c1.3 0 2.5-.4 3.5-1M10.8 4.2A6.6 6.6 0 0 1 14.5 8s-.9 1.7-2.4 3"
                      stroke="currentColor"
                      strokeWidth="1.35"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="layer-toggle-name">{layer.label}</span>
              {count > 0 && <span className="layer-toggle-count tabular">{count}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
