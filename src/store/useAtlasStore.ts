import { create } from 'zustand';
import type { Architecture, LayerId } from '../dsl/types';
import { BLANK_TEMPLATE, parseArchitectureText, type Diagnostic, type ParseResult } from '../dsl/parse';
import { EditError, type EditContext, type EditResult } from '../dsl/edit';
import { architectures } from '../architectures';

/** Pseudo-id of the user's own architecture in the selector. */
export const CUSTOM_ID = 'custom';
export const DRAFT_STORAGE_KEY = 'atlas.draft.v1';

const MAX_HISTORY = 100;
/** Consecutive edits of the same field within this window become one undo step. */
const COALESCE_MS = 1500;

interface HistoryEntry {
  before: string;
  after: string;
  key?: string;
  at: number;
}

export type EditFn = (text: string, ctx: EditContext) => EditResult;

interface AtlasState {
  architectureId: string;
  activeLayers: Set<LayerId>;
  /** High-level app mode: 'explore' (clean presentation, 85%+ canvas) vs 'build' (editing workspace). */
  appMode: 'explore' | 'build';
  setAppMode: (mode: 'explore' | 'build') => void;

  /** Selected node or group id. */
  selectedId: string | null;
  setArchitecture: (id: string) => void;
  toggleLayer: (layer: LayerId) => void;
  setAllLayers: (layers: LayerId[]) => void;
  select: (id: string | null) => void;

  /** Index into the current architecture's stages (0 when it has none). */
  stageIndex: number;
  setStage: (index: number) => void;

  /** Request tracing. */
  traceId: string | null;
  traceStep: number;
  tracePlaying: boolean;
  startTrace: (id: string) => void;
  stopTrace: () => void;
  setTraceStep: (step: number) => void;
  setTracePlaying: (playing: boolean) => void;

  /** DSL editor. `draftText` is the source of truth; `draft` is its last valid parse. */
  editorOpen: boolean;
  draftText: string;
  /** Bumped only when text is replaced from outside the editor (load, import, reset). */
  draftTextRev: number;
  draft: Architecture | null;
  diagnostics: Diagnostic[];
  /** Next successful parse turns every layer on (set after loading a new document). */
  resetLayersOnParse: boolean;
  setEditorOpen: (open: boolean) => void;
  setDraftText: (text: string) => void;
  loadDraftText: (text: string) => void;
  applyParse: (result: ParseResult) => void;

  /** Visual editing. Bumped when a canvas edit rewrites the text, so the editor can follow. */
  draftEditRev: number;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /** Transient message for the canvas (refused edits, stage-aware deletions). */
  notice: string | null;
  setNotice: (notice: string | null) => void;
  /** Apply a visual edit to the draft. Returns false when it was refused. */
  runEdit: (fn: EditFn, coalesceKey?: string) => boolean;
  undo: () => void;
  redo: () => void;
}

function readStoredDraft(): string {
  try {
    return localStorage.getItem(DRAFT_STORAGE_KEY) ?? BLANK_TEMPLATE;
  } catch {
    return BLANK_TEMPLATE;
  }
}

const first = architectures[0];

export const useAtlasStore = create<AtlasState>((set, get) => ({
  appMode: 'explore',
  setAppMode: (mode) => set({ appMode: mode }),
  architectureId: first.id,
  activeLayers: new Set(first.layers),
  selectedId: null,
  stageIndex: 0,
  traceId: null,
  traceStep: 0,
  tracePlaying: false,

  editorOpen: false,
  draftText: readStoredDraft(),
  draftTextRev: 0,
  draft: null,
  diagnostics: [],
  resetLayersOnParse: false,
  draftEditRev: 0,
  undoStack: [],
  redoStack: [],
  notice: null,

  setArchitecture: (id) => {
    const arch = id === CUSTOM_ID ? get().draft : architectures.find((a) => a.id === id);
    if (id !== CUSTOM_ID && !arch) return;
    set({
      architectureId: id,
      activeLayers: new Set(arch?.layers ?? []),
      selectedId: null,
      stageIndex: 0,
      traceId: null,
      traceStep: 0,
      tracePlaying: false,
    });
  },

  toggleLayer: (layer) => {
    const next = new Set(get().activeLayers);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    set({ activeLayers: next });
  },

  setAllLayers: (layers) => set({ activeLayers: new Set(layers) }),

  select: (id) => set({ selectedId: id }),

  // A trace belongs to one stage's topology, so changing stage stops it.
  setStage: (index) => set({ stageIndex: index, traceId: null, traceStep: 0, tracePlaying: false }),

  startTrace: (id) => set({ traceId: id, traceStep: 0, tracePlaying: true, selectedId: null }),
  stopTrace: () => set({ traceId: null, traceStep: 0, tracePlaying: false }),
  setTraceStep: (step) => set({ traceStep: step }),
  setTracePlaying: (playing) => set({ tracePlaying: playing }),

  setEditorOpen: (open) => set({ editorOpen: open }),
  setDraftText: (text) => set({ draftText: text }),
  // A new document starts a new history: old undo steps would not apply to it.
  loadDraftText: (text) =>
    set((s) => ({
      draftText: text,
      draftTextRev: s.draftTextRev + 1,
      resetLayersOnParse: true,
      undoStack: [],
      redoStack: [],
    })),

  setNotice: (notice) => set({ notice }),

  runEdit: (fn, coalesceKey) => {
    const s = get();
    if (s.diagnostics.some((d) => d.severity === 'error')) {
      set({ notice: 'Fix the errors in the YAML first; the canvas shows an older version.' });
      return false;
    }
    let result: EditResult;
    try {
      result = fn(s.draftText, { stageIndex: s.stageIndex });
    } catch (err) {
      if (err instanceof EditError) {
        set({ notice: err.message });
        return false;
      }
      throw err;
    }
    if (result.text === s.draftText) return true;

    const now = Date.now();
    const top = s.undoStack.at(-1);
    const merge = coalesceKey !== undefined && top?.key === coalesceKey && top.after === s.draftText && now - top.at < COALESCE_MS;
    const undoStack = merge
      ? [...s.undoStack.slice(0, -1), { ...top, after: result.text, at: now }]
      : [...s.undoStack.slice(-(MAX_HISTORY - 1)), { before: s.draftText, after: result.text, key: coalesceKey, at: now }];

    set({
      draftText: result.text,
      draftEditRev: s.draftEditRev + 1,
      undoStack,
      redoStack: [],
      notice: result.message ?? null,
      ...(result.select !== undefined ? { selectedId: result.select } : {}),
    });
    // Parse now rather than after the typing debounce, so the canvas reacts at once.
    get().applyParse(parseArchitectureText(result.text));

    // Make sure a freshly added or edited item is not hidden by a layer toggle.
    const after = get();
    const item = after.draft && [...after.draft.nodes, ...after.draft.groups].find((x) => x.id === result.select);
    if (item && !after.activeLayers.has(item.layer)) set({ activeLayers: new Set([...after.activeLayers, item.layer]) });
    return true;
  },

  undo: () => restore('undo'),
  redo: () => restore('redo'),

  applyParse: ({ arch, diagnostics }) => {
    const s = get();
    if (!arch || JSON.stringify(arch) === JSON.stringify(s.draft)) {
      set({ diagnostics });
      return;
    }
    const patch: Partial<AtlasState> = { diagnostics, draft: arch, resetLayersOnParse: false };
    if (s.architectureId === CUSTOM_ID) {
      if (s.resetLayersOnParse) {
        patch.activeLayers = new Set(arch.layers);
      } else {
        // Keep the user's toggles for layers that still exist; show newly added layers.
        const before = new Set(s.draft?.layers ?? []);
        patch.activeLayers = new Set(arch.layers.filter((l) => !before.has(l) || s.activeLayers.has(l)));
      }
      const trace = arch.traces?.find((t) => t.id === s.traceId);
      if (s.traceId && !trace) Object.assign(patch, { traceId: null, traceStep: 0, tracePlaying: false });
      else if (trace) patch.traceStep = Math.min(s.traceStep, trace.steps.length - 1);
      const stageCount = arch.stages?.length ?? 0;
      if (s.stageIndex >= stageCount) patch.stageIndex = Math.max(0, stageCount - 1);
      const ids = new Set([...arch.nodes.map((n) => n.id), ...arch.groups.map((g) => g.id)]);
      if (s.selectedId && !ids.has(s.selectedId)) patch.selectedId = null;
    }
    set(patch);
  },
}));

/**
 * Step through visual-edit history. History only applies while the text is
 * exactly what the last visual edit produced; hand edits in the YAML have
 * their own undo inside the editor, so a mismatch clears this history.
 */
function restore(direction: 'undo' | 'redo'): void {
  const s = useAtlasStore.getState();
  const from = direction === 'undo' ? s.undoStack : s.redoStack;
  const entry = from.at(-1);
  if (!entry) return;
  const expected = direction === 'undo' ? entry.after : entry.before;
  if (s.draftText !== expected) {
    useAtlasStore.setState({ undoStack: [], redoStack: [], notice: 'Canvas history cleared: the YAML was edited by hand.' });
    return;
  }
  const text = direction === 'undo' ? entry.before : entry.after;
  const moved = { ...entry, key: undefined };
  useAtlasStore.setState({
    draftText: text,
    draftEditRev: s.draftEditRev + 1,
    undoStack: direction === 'undo' ? s.undoStack.slice(0, -1) : [...s.undoStack, moved],
    redoStack: direction === 'undo' ? [...s.redoStack, moved] : s.redoStack.slice(0, -1),
    notice: null,
  });
  s.applyParse(parseArchitectureText(text));
}

/** Whether undo / redo would currently do something (used for button state). */
export function historyState(s: Pick<AtlasState, 'undoStack' | 'redoStack' | 'draftText'>) {
  return {
    canUndo: s.undoStack.at(-1)?.after === s.draftText,
    canRedo: s.redoStack.at(-1)?.before === s.draftText,
  };
}
