import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import {
  applyNodeChanges,
  Background,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeMouseHandler,
  type FitViewOptions,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { isDraftBackedState, useAtlasStore } from '../store/useAtlasStore';
import { useStagedView } from '../store/useStagedView';
import { filterByLayers } from '../layout/filter';
import { layoutGraph, type AtlasEdge, type AtlasNode } from '../layout/elk';
import { InfraNodeView } from './InfraNodeView';
import { GroupNodeView } from './GroupNodeView';
import { PALETTE_MIME, type PalettePayload } from './Palette';
import { useCanEdit } from '../store/useCanEdit';
import { addEdge, addGroup, addNode, deleteEdge, deleteItem, moveItem } from '@atlas/shared';

interface CanvasProps {
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
}

/** Elements where Delete and Ctrl+Z belong to the element itself. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Absolute rectangles of every box (group) in the laid-out graph. */
function groupRects(nodes: AtlasNode[]): Rect[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const abs = (n: AtlasNode): { x: number; y: number } => {
    const parent = n.parentId ? byId.get(n.parentId) : undefined;
    const p = parent ? abs(parent) : { x: 0, y: 0 };
    return { x: p.x + n.position.x, y: p.y + n.position.y };
  };
  return nodes
    .filter((n) => n.type === 'zone')
    .map((n) => ({
      id: n.id,
      ...abs(n),
      w: Number(n.style?.width ?? 0),
      h: Number(n.style?.height ?? 0),
    }));
}

/** Ids of a group and everything nested in it. */
function subtree(nodes: AtlasNode[], rootId: string): Set<string> {
  const out = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && out.has(n.parentId) && !out.has(n.id)) {
        out.add(n.id);
        grew = true;
      }
    }
  }
  return out;
}

const nodeTypes = { infra: InfraNodeView, zone: GroupNodeView };
const FIT: FitViewOptions = { padding: 0.1 };
/** Matches the CSS transition on nodes while `.animating` is set. */
const MOVE_MS = 300;

export function Canvas({ sidebarCollapsed = false, onExpandSidebar }: CanvasProps) {
  const architectureId = useAtlasStore((s) => s.architectureId);
  const theme = useAtlasStore((s) => s.theme);
  const activeLayers = useAtlasStore((s) => s.activeLayers);
  const select = useAtlasStore((s) => s.select);
  const traceId = useAtlasStore((s) => s.traceId);
  const traceStep = useAtlasStore((s) => s.traceStep);
  const draftTextRev = useAtlasStore((s) => s.draftTextRev);
  const editorOpen = useAtlasStore((s) => s.editorOpen);
  const draftEditRev = useAtlasStore((s) => s.draftEditRev);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const runEdit = useAtlasStore((s) => s.runEdit);
  const undo = useAtlasStore((s) => s.undo);
  const redo = useAtlasStore((s) => s.redo);
  const notice = useAtlasStore((s) => s.notice);
  const setNotice = useAtlasStore((s) => s.setNotice);
  const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();
  const { canEdit } = useCanEdit();

  const [nodes, setNodes] = useState<AtlasNode[]>([]);
  const [edges, setEdges] = useState<AtlasEdge[]>([]);
  const [busy, setBusy] = useState(false);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const lastRemountKey = useRef('');
  const lastMoveKey = useRef('');
  const lastEditRev = useRef(0);
  /** Positions from the last layout, to snap back after a drag that changed nothing. */
  const laidOut = useRef<AtlasNode[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const shownCount = useRef(0);
  const pendingFit = useRef(false);

  const view = useStagedView();
  const arch = view?.arch;
  const cloudArchitectures = useAtlasStore((s) => s.cloudArchitectures);
  const isDraft = isDraftBackedState({ architectureId, cloudArchitectures });

  // A different document remounts the canvas (instant fit). Stage and layer
  // changes keep it mounted so nodes glide to their new positions.
  // Plain edits in the editor change neither key and keep the viewport.
  const remountKey = `${architectureId}|${isDraft ? draftTextRev : ''}`;
  const moveKey = `${view?.index ?? 0}|${[...activeLayers].sort().join(',')}`;

  useEffect(() => {
    if (!arch) {
      shownCount.current = 0;
      setNodes([]);
      setEdges([]);
      return;
    }
    let cancelled = false;
    if (!isDraft) setBusy(true);
    layoutGraph(filterByLayers(arch, activeLayers))
      .then(({ nodes: laidNodes, edges: laidEdges }) => {
        if (cancelled) return;
        const remount = remountKey !== lastRemountKey.current || shownCount.current === 0;
        const move = !remount && moveKey !== lastMoveKey.current;
        const edited = !remount && !move && draftEditRev !== lastEditRev.current;
        lastRemountKey.current = remountKey;
        lastMoveKey.current = moveKey;
        lastEditRev.current = draftEditRev;
        laidOut.current = laidNodes;
        shownCount.current = laidNodes.length;
        setLayoutError(null);
        setBusy(false);
        setNodes(laidNodes);
        setEdges(laidEdges);
        if (remount) setLayoutVersion((v) => v + 1);
        else if (move) {
          pendingFit.current = true;
          setAnimating(true);
        } else if (edited) setAnimating(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setBusy(false);
        setLayoutError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arch, activeLayers]);

  // Smooth 300ms camera transition after stage/layer changes.
  useEffect(() => {
    if (!pendingFit.current) return;
    pendingFit.current = false;
    window.setTimeout(() => fitView({ ...FIT, duration: MOVE_MS }), 40);
  }, [nodes, fitView]);

  // Refit smoothly when toggling the YAML drawer or collapsing/expanding the left rail.
  const editorShown = isDraft && editorOpen;
  const firstPanelRender = useRef(true);
  useEffect(() => {
    if (firstPanelRender.current) {
      firstPanelRender.current = false;
      return;
    }
    const t = window.setTimeout(() => fitView({ ...FIT, duration: MOVE_MS }), 120);
    return () => window.clearTimeout(t);
  }, [editorShown, sidebarCollapsed, fitView]);

  useEffect(() => {
    if (!animating) return;
    const t = window.setTimeout(() => setAnimating(false), MOVE_MS + 120);
    return () => window.clearTimeout(t);
  }, [animating]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(t);
  }, [notice, setNotice]);

  // --- Visual editing -------------------------------------------------------

  const flowPoint = (e: { clientX: number; clientY: number }) =>
    screenToFlowPosition({ x: e.clientX, y: e.clientY });

  /** The innermost box under a point, ignoring `exclude` (the dragged item and its contents). */
  const boxAt = useCallback(
    (point: { x: number; y: number }, exclude: Set<string> = new Set()): string | undefined => {
      const hits = groupRects(laidOut.current).filter(
        (r) =>
          !exclude.has(r.id) &&
          point.x >= r.x &&
          point.x <= r.x + r.w &&
          point.y >= r.y &&
          point.y <= r.y + r.h,
      );
      hits.sort((a, b) => a.w * a.h - b.w * b.h);
      return hits[0]?.id;
    },
    [],
  );

  const onNodesChange = useCallback((changes: NodeChange<AtlasNode>[]) => {
    const moves = changes.filter((c) => c.type === 'position');
    if (moves.length) setNodes((nds) => applyNodeChanges(moves, nds));
  }, []);

  const pointerOf = (e: MouseEvent | TouchEvent) =>
    'touches' in e ? (e.changedTouches[0] ?? e.touches[0]) : e;

  const onNodeDrag: OnNodeDrag<AtlasNode> = (e, node) => {
    setDropTarget(boxAt(flowPoint(pointerOf(e)), subtree(laidOut.current, node.id)) ?? null);
  };

  const onNodeDragStop: OnNodeDrag<AtlasNode> = (e, node) => {
    setDropTarget(null);
    const target = boxAt(flowPoint(pointerOf(e)), subtree(laidOut.current, node.id));
    const current = laidOut.current.find((n) => n.id === node.id)?.parentId;
    const moved = target !== current && runEdit((text, ctx) => moveItem(text, ctx, node.id, target));
    if (!moved) setNodes(laidOut.current);
  };

  const onDragOver = (e: DragEvent) => {
    if (!canEdit || !e.dataTransfer.types.includes(PALETTE_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const box = boxAt(flowPoint(e)) ?? null;
    if (box !== dropTarget) setDropTarget(box);
  };

  const onDrop = (e: DragEvent) => {
    const raw = e.dataTransfer.getData(PALETTE_MIME);
    setDropTarget(null);
    if (!canEdit || !raw) return;
    e.preventDefault();
    const payload = JSON.parse(raw) as PalettePayload;
    const box = boxAt(flowPoint(e));
    runEdit((text, ctx) =>
      payload.kind === 'node'
        ? addNode(text, ctx, { type: payload.type, group: box })
        : addGroup(text, ctx, { kind: payload.groupKind, parent: box }),
    );
  };

  const onConnect = (c: Connection) => {
    if (c.source && c.target)
      runEdit((text, ctx) => addEdge(text, ctx, { from: c.source, to: c.target }));
  };

  const onEdgeClick: EdgeMouseHandler = (_, edge) => {
    if (!canEdit) return;
    setSelectedEdge(`${edge.source}->${edge.target}`);
    select(null);
  };

  // Keyboard: Delete removes the selection, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y walk the history.
  useEffect(() => {
    if (!isDraft) return;
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      if (!canEdit || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
      if (selectedEdge) {
        const [from, to] = selectedEdge.split('->');
        e.preventDefault();
        if (runEdit((text, ctx) => deleteEdge(text, ctx, from, to))) setSelectedEdge(null);
      } else if (selectedId) {
        e.preventDefault();
        runEdit((text, ctx) => deleteItem(text, ctx, selectedId));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isDraft, canEdit, selectedEdge, selectedId, runEdit, undo, redo]);

  useEffect(() => {
    if (!canEdit) setSelectedEdge(null);
  }, [canEdit]);

  // Decorate the laid-out graph with stage and trace state without re-running the layout.
  const trace = arch?.traces?.find((t) => t.id === traceId);
  const diff = view?.diff;
  const { shownNodes, shownEdges } = useMemo(() => {
    const stageClass = (id: string) =>
      diff?.newIds.has(id) ? 'stage-new' : diff?.changedIds.has(id) ? 'stage-changed' : undefined;
    const current = trace?.steps[traceStep];
    if (!trace || !current) {
      return {
        shownNodes: nodes.map((n) => ({
          ...n,
          className: n.id === dropTarget ? 'drop-target' : stageClass(n.id),
          ...(canEdit ? { draggable: true, extent: undefined } : {}),
        })),
        shownEdges: edges.map((e) =>
          `${e.source}->${e.target}` === selectedEdge
            ? { ...e, className: 'edge-selected', zIndex: 1001 }
            : e,
        ),
      };
    }
    const done = new Set<string>();
    const touched = new Set<string>();
    let active = '';
    trace.steps.forEach((st, i) => {
      const key = `${st.from}->${st.to}`;
      if (i <= traceStep) {
        touched.add(st.from);
        touched.add(st.to);
        if (i < traceStep) done.add(key);
        else active = key;
      }
    });
    const activeNodes = new Set([current.from, current.to]);
    return {
      shownNodes: nodes.map((n) =>
        n.type !== 'infra'
          ? n
          : {
              ...n,
              className: activeNodes.has(n.id)
                ? 'trace-active'
                : touched.has(n.id)
                  ? 'trace-done'
                  : 'trace-dim',
            },
      ),
      shownEdges: edges.map((e) => {
        const key = `${e.source}->${e.target}`;
        const cls = key === active ? 'trace-active' : done.has(key) ? 'trace-done' : 'trace-dim';
        return { ...e, className: cls, animated: key === active };
      }),
    };
  }, [nodes, edges, trace, traceStep, diff, dropTarget, canEdit, selectedEdge]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    select(node.id);
    setSelectedEdge(null);
    setShortcutsOpen(false);
  };

  return (
    <div
      className={`canvas${animating ? ' animating' : ''}${canEdit ? ' editing' : ''}${connecting ? ' connecting' : ''}`}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null);
      }}
    >
      {/* Collapsed sidebar re-open trigger */}
      {sidebarCollapsed && onExpandSidebar && (
        <button
          type="button"
          className="canvas-expand-rail-btn"
          onClick={onExpandSidebar}
          title="Expand workbench sidebar ([)"
          aria-label="Expand workbench sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M5.5 2.5v11" stroke="currentColor" strokeWidth="1.3" />
            <path d="M8.5 6.5 10.5 8l-2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Workbench</span>
          <span className="key-hint">[</span>
        </button>
      )}

      {notice && <div className="canvas-notice">{notice}</div>}
      {busy && <div className="canvas-busy">Calculating layout…</div>}
      {layoutError && <div className="canvas-busy error">Layout failed: {layoutError}</div>}
      {isDraft && !arch && (
        <div className="canvas-empty">Fix the errors in the YAML editor to render the diagram.</div>
      )}

      <ReactFlow
        key={layoutVersion}
        fitView
        fitViewOptions={FIT}
        nodes={shownNodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => {
          select(null);
          setSelectedEdge(null);
          setShortcutsOpen(false);
        }}
        onNodesChange={onNodesChange}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectStart={() => setConnecting(true)}
        onConnectEnd={() => setConnecting(false)}
        onEdgeClick={onEdgeClick}
        nodesDraggable={canEdit}
        nodesConnectable={canEdit}
        deleteKeyCode={null}
        elementsSelectable
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
        colorMode={theme}
      >
        <Background gap={24} size={1} color={theme === 'dark' ? '#262A33' : '#DCDAD2'} />
      </ReactFlow>

      {/* Minimal Bottom-Right Canvas Controls: Zoom + / -, Fit View, and ? Shortcuts */}
      <div className="canvas-corner-controls" role="toolbar" aria-label="Canvas navigation">
        {shortcutsOpen && (
          <div className="shortcuts-popover" role="dialog" aria-label="Keyboard shortcuts">
            <div className="shortcuts-title">Keyboard Shortcuts</div>
            <dl className="shortcuts-list">
              <div className="shortcut-row">
                <dt className="tabular">↑ / ↓</dt>
                <dd>Step stages or trace hops</dd>
              </div>
              <div className="shortcut-row">
                <dt className="tabular">[</dt>
                <dd>Toggle left workbench</dd>
              </div>
              <div className="shortcut-row">
                <dt className="tabular">⌘K</dt>
                <dd>Switch architecture</dd>
              </div>
              <div className="shortcut-row">
                <dt className="tabular">Esc</dt>
                <dd>Close detail / stop trace</dd>
              </div>
            </dl>
          </div>
        )}

        <div className="corner-control-group">
          <button
            type="button"
            className="corner-btn"
            onClick={() => zoomIn({ duration: 200 })}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="corner-btn"
            onClick={() => zoomOut({ duration: 200 })}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="corner-btn"
            onClick={() => fitView({ ...FIT, duration: 300 })}
            title="Fit diagram to view"
            aria-label="Fit view"
          >
            ⊡
          </button>
          <button
            type="button"
            className={`corner-btn${shortcutsOpen ? ' active' : ''}`}
            onClick={() => setShortcutsOpen((o) => !o)}
            title="Keyboard shortcuts"
            aria-label="Keyboard shortcuts"
            aria-expanded={shortcutsOpen}
          >
            ?
          </button>
        </div>
      </div>
    </div>
  );
}
