import type { DragEvent } from 'react';
import { GROUP_KINDS, LAYERS, type GroupKind, type LayerId, type NodeType } from '@atlas/shared';
import { DEFAULT_NODE_LAYER, GROUP_KIND_INFO, NODE_TYPES } from '@atlas/shared';
import { NODE_TYPE_IDS } from '@atlas/shared';
import { addGroup, addNode } from '@atlas/shared';
import { useAtlasStore } from '../store/useAtlasStore';
import { useStagedView } from '../store/useStagedView';
import { useCanEdit } from '../store/useCanEdit';

/** Drag payload between the palette and the canvas. */
export const PALETTE_MIME = 'application/x-atlas-palette';
export type PalettePayload = { kind: 'node'; type: NodeType } | { kind: 'group'; groupKind: GroupKind };

const SECTIONS: { title: string; layers: LayerId[] }[] = [
  { title: 'Edge & Network', layers: ['physical', 'network'] },
  { title: 'Compute & Services', layers: ['compute', 'services'] },
  { title: 'Data', layers: ['data'] },
  { title: 'Platform', layers: ['platform'] },
];

function onDragStart(e: DragEvent, payload: PalettePayload) {
  e.dataTransfer.setData(PALETTE_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = 'copy';
}

/** Component and box palette for the draft. Drag onto the canvas, or click to add. */
export function Palette() {
  const { canEdit, reason } = useCanEdit();
  const runEdit = useAtlasStore((s) => s.runEdit);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const view = useStagedView();

  // A click adds into the selected box, or next to the selected component.
  const targetGroup = (): string | undefined => {
    if (!selectedId || !view) return undefined;
    if (view.arch.groups.some((g) => g.id === selectedId)) return selectedId;
    return view.arch.nodes.find((n) => n.id === selectedId)?.group;
  };

  return (
    <div className="palette" role="region" aria-label="Component and Container Palette">
      <div className="panel-title">
        <span>Component Palette</span>
        {canEdit && (
          <span className="kind tabular" style={{ marginLeft: 'auto' }}>
            DRAG & DROP
          </span>
        )}
      </div>
      {!canEdit && <p className="muted small insp-note">{reason}</p>}
      <div className={`palette-body${canEdit ? '' : ' disabled'}`}>
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="palette-section">{section.title}</div>
            <div className="palette-grid">
              {NODE_TYPE_IDS.filter((t) => section.layers.includes(DEFAULT_NODE_LAYER[t])).map((t) => {
                const info = NODE_TYPES[t];
                return (
                  <button
                    key={t}
                    className="palette-item"
                    draggable={canEdit}
                    disabled={!canEdit}
                    onDragStart={(e) => onDragStart(e, { kind: 'node', type: t })}
                    onClick={() => runEdit((text, ctx) => addNode(text, ctx, { type: t, group: targetGroup() }))}
                    title={`${info.description} (${LAYERS[DEFAULT_NODE_LAYER[t]].label} layer)`}
                  >
                    <span className="palette-glyph">{info.glyph}</span>
                    <span className="palette-label">{info.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="palette-section">Perimeter Boundaries</div>
        <div className="palette-grid">
          {GROUP_KINDS.map((k) => (
            <button
              key={k}
              className="palette-item group"
              draggable={canEdit}
              disabled={!canEdit}
              onDragStart={(e) => onDragStart(e, { kind: 'group', groupKind: k })}
              onClick={() => runEdit((text, ctx) => addGroup(text, ctx, { kind: k, parent: targetGroup() }))}
              title={`Add ${GROUP_KIND_INFO[k].label} container box`}
            >
              <span className="palette-glyph">{GROUP_KIND_INFO[k].glyph}</span>
              <span className="palette-label">{GROUP_KIND_INFO[k].label}</span>
            </button>
          ))}
        </div>

        <ul className="palette-help">
          <li>Drop onto a box to place inside that perimeter.</li>
          <li>Drag a component onto another box to re-parent it.</li>
          <li>Drag from the port under a component to connect.</li>
          <li>Select and press Delete/Backspace to remove.</li>
        </ul>
      </div>
    </div>
  );
}
