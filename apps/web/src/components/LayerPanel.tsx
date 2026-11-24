import { LAYERS, type LayerId } from '@atlas/shared';
import { useArchitecture } from '../store/useArchitecture';
import { useAtlasStore } from '../store/useAtlasStore';
import { TracePanel } from './TracePanel';
import { Palette } from './Palette';
import { isDraftBackedState } from '../store/useAtlasStore';

const LAYER_ACCENTS: Record<LayerId, string> = {
  physical: '#d95d39',
  network: '#258bd2',
  compute: '#4f6df5',
  services: '#10b981',
  data: '#d9822b',
  platform: '#8b5cf6',
};

export function LayerPanel() {
  const isDraft = useAtlasStore((s) => isDraftBackedState(s));
  const active = useAtlasStore((s) => s.activeLayers);
  const toggle = useAtlasStore((s) => s.toggleLayer);
  const setAll = useAtlasStore((s) => s.setAllLayers);
  const arch = useArchitecture();
  if (!arch) return null;

  // Count items per layer for tactical cartographic density readout
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
    <aside className="panel layer-panel" aria-label="Layer Visibility Controls">
      {isDraft && <Palette />}
      <div className="panel-title">
        <span>Cartographic Layers</span>
        <span className="panel-actions">
          <button onClick={() => setAll(arch.layers)} title="Show all layers">
            All
          </button>
          <button onClick={() => setAll([])} title="Hide all layers">
            None
          </button>
        </span>
      </div>
      <div className="layer-list" role="group" aria-label="Toggle visible layers">
        {arch.layers.map((id) => {
          const layer = LAYERS[id];
          const on = active.has(id);
          const accent = LAYER_ACCENTS[id] ?? '#64748b';
          const count = layerCounts[id] ?? 0;
          return (
            <label
              key={id}
              className={`layer-row${on ? ' on' : ''}`}
              title={layer.description}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(id)}
                aria-label={`Toggle ${layer.label} layer`}
              />
              <span className="layer-content">
                <span className="layer-header-line">
                  <span
                    className="layer-dot"
                    style={{ background: accent, opacity: on ? 1 : 0.4 }}
                  />
                  <span className="layer-label">{layer.label}</span>
                  {count > 0 && <span className="layer-count tabular">{count}</span>}
                </span>
                <span className="layer-desc">{layer.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      <TracePanel />
    </aside>
  );
}
