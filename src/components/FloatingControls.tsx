import { useEffect, useRef, useState } from 'react';
import { LAYERS, type LayerId } from '../dsl/types';
import { useArchitecture } from '../store/useArchitecture';
import { useAtlasStore } from '../store/useAtlasStore';
import { useStagedView } from '../store/useStagedView';

export function FloatingControls() {
  const [openMenu, setOpenMenu] = useState<'layers' | 'traces' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeLayers = useAtlasStore((s) => s.activeLayers);
  const toggleLayer = useAtlasStore((s) => s.toggleLayer);
  const setAllLayers = useAtlasStore((s) => s.setAllLayers);

  const traceId = useAtlasStore((s) => s.traceId);
  const startTrace = useAtlasStore((s) => s.startTrace);
  const stopTrace = useAtlasStore((s) => s.stopTrace);

  const arch = useArchitecture();
  const stagedView = useStagedView();
  const stagesArch = stagedView?.arch ?? arch;
  const traces = stagesArch?.traces ?? [];

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    if (!openMenu) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  if (!stagesArch) return null;

  const totalLayers = stagesArch.layers.length;
  const activeCount = stagesArch.layers.filter((l) => activeLayers.has(l)).length;

  return (
    <div className="floating-controls" ref={containerRef} role="toolbar" aria-label="Diagram display controls">
      <div className="floating-pills">
        {/* Layers Pill */}
        <button
          className={`floating-pill${openMenu === 'layers' ? ' active' : ''}${activeCount < totalLayers ? ' filtered' : ''}`}
          onClick={() => setOpenMenu(openMenu === 'layers' ? null : 'layers')}
          aria-expanded={openMenu === 'layers'}
          title="Filter visible architecture layers"
        >
          <span className="floating-pill-icon">◫</span>
          <span className="floating-pill-label">Layers</span>
          <span className="floating-pill-badge tabular">
            {activeCount}/{totalLayers}
          </span>
        </button>

        {/* Traces Pill (only shown when the architecture defines traces) */}
        {traces.length > 0 && (
          <button
            className={`floating-pill${openMenu === 'traces' || traceId ? ' active' : ''}`}
            onClick={() => setOpenMenu(openMenu === 'traces' ? null : 'traces')}
            aria-expanded={openMenu === 'traces'}
            title="Inspect request traffic paths"
          >
            <span className="floating-pill-icon">⇄</span>
            <span className="floating-pill-label">Traces</span>
            <span className="floating-pill-badge tabular">{traces.length}</span>
            {traceId && <span className="floating-pill-pulse" />}
          </button>
        )}
      </div>

      {/* Layers Popover Card */}
      {openMenu === 'layers' && (
        <div className="floating-popover layers-popover" role="dialog" aria-label="Layer Filters">
          <div className="popover-header">
            <span className="popover-title">Cartographic Layers</span>
            <div className="popover-actions">
              <button
                className="popover-mini-btn"
                onClick={() => setAllLayers(stagesArch.layers)}
                title="Show all layers"
              >
                All
              </button>
              <button
                className="popover-mini-btn"
                onClick={() => setAllLayers([])}
                title="Hide all layers"
              >
                None
              </button>
            </div>
          </div>
          <div className="popover-list">
            {stagesArch.layers.map((id: LayerId) => {
              const layer = LAYERS[id];
              const on = activeLayers.has(id);
              return (
                <label key={id} className={`popover-row${on ? ' on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleLayer(id)}
                  />
                  <div className="popover-row-text">
                    <span className="popover-row-label">{layer.label}</span>
                    <span className="popover-row-desc">{layer.description}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Traces Popover Card */}
      {openMenu === 'traces' && (
        <div className="floating-popover traces-popover" role="dialog" aria-label="Request Traces">
          <div className="popover-header">
            <span className="popover-title">Simulated Request Paths</span>
          </div>
          <div className="popover-list">
            {traces.map((t) => {
              const on = t.id === traceId;
              return (
                <button
                  key={t.id}
                  className={`trace-item-btn${on ? ' active' : ''}`}
                  onClick={() => {
                    if (on) stopTrace();
                    else {
                      startTrace(t.id);
                      setOpenMenu(null);
                    }
                  }}
                  title={t.description}
                >
                  <span className="trace-item-play">{on ? '■' : '▶'}</span>
                  <div className="trace-item-info">
                    <span className="trace-item-name">{t.name}</span>
                    {t.description && <span className="trace-item-desc">{t.description}</span>}
                  </div>
                  <span className="trace-item-hops tabular">{t.steps.length} hops</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
