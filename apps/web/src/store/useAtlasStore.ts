import { create } from 'zustand';
import {
  BLANK_TEMPLATE,
  EditError,
  parseArchitectureText,
  referenceArchitectures,
  type Architecture,
  type ArchitectureRecordDto,
  type AuthUserDto,
  type CompanyWithRoleDto,
  type Diagnostic,
  type EditContext,
  type EditResult,
  type LayerId,
  type ParseResult,
} from '@atlas/shared';
import { api, ApiError } from '../api/client';

/** Pseudo-id of the user's own local scratch architecture in the selector. */
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

export interface AtlasState {
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

  /** Active editor buffer (`CUSTOM_ID` local draft OR an opened cloud architecture). */
  editorOpen: boolean;
  draftText: string;
  /** Preserved local scratch draft so viewing a cloud architecture never overwrites localStorage. */
  localDraftText: string;
  /** Bumped only when text is replaced from outside the editor (load, import, reset, cloud open). */
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
  /** Transient message for the canvas (refused edits, stage-aware deletions, cloud saves). */
  notice: string | null;
  setNotice: (notice: string | null) => void;
  /** Apply a visual edit to the active editable text. Returns false when refused. */
  runEdit: (fn: EditFn, coalesceKey?: string) => boolean;
  undo: () => void;
  redo: () => void;

  /** Auth, companies, and cloud architectures. */
  authLoaded: boolean;
  apiAvailable: boolean;
  user: AuthUserDto | null;
  companies: CompanyWithRoleDto[];
  cloudArchitectures: ArchitectureRecordDto[];
  savingCloud: boolean;
  bootstrapWorkspace: () => Promise<void>;
  refreshCloudData: () => Promise<void>;
  logout: () => Promise<void>;
  switchActiveCompany: (companyId: string | null) => Promise<void>;
  upsertCloudArchitecture: (record: ArchitectureRecordDto, selectIt?: boolean) => void;
  removeCloudArchitecture: (id: string) => void;
  saveCurrentCloudArchitecture: () => Promise<boolean>;
}

function readStoredDraft(): string {
  try {
    return localStorage.getItem(DRAFT_STORAGE_KEY) ?? BLANK_TEMPLATE;
  } catch {
    return BLANK_TEMPLATE;
  }
}

export function isDraftBackedState(
  s: Pick<AtlasState, 'architectureId' | 'cloudArchitectures'>,
): boolean {
  if (s.architectureId === CUSTOM_ID) return true;
  const cloud = s.cloudArchitectures.find((c) => c.id === s.architectureId);
  return Boolean(cloud && !cloud.isReference);
}

export function selectActiveCloud(
  s: Pick<AtlasState, 'architectureId' | 'cloudArchitectures'>,
): ArchitectureRecordDto | undefined {
  return s.cloudArchitectures.find(
    (c) => c.id === s.architectureId || (c.isReference && c.slug === s.architectureId),
  );
}

const first = referenceArchitectures[0];
const initialLocalDraft = readStoredDraft();

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
  draftText: initialLocalDraft,
  localDraftText: initialLocalDraft,
  draftTextRev: 0,
  draft: null,
  diagnostics: [],
  resetLayersOnParse: false,
  draftEditRev: 0,
  undoStack: [],
  redoStack: [],
  notice: null,

  authLoaded: false,
  apiAvailable: true,
  user: null,
  companies: [],
  cloudArchitectures: [],
  savingCloud: false,

  setArchitecture: (id) => {
    const s = get();
    const wasLocalDraft = s.architectureId === CUSTOM_ID;
    const savedLocalDraft = wasLocalDraft ? s.draftText : s.localDraftText;

    if (id === CUSTOM_ID) {
      const parsed = parseArchitectureText(savedLocalDraft);
      const layers = parsed.arch?.layers ?? s.draft?.layers ?? [];
      set({
        architectureId: CUSTOM_ID,
        localDraftText: savedLocalDraft,
        draftText: savedLocalDraft,
        draftTextRev: s.draftTextRev + 1,
        draft: parsed.arch ?? null,
        diagnostics: parsed.diagnostics,
        activeLayers: new Set(layers),
        selectedId: null,
        stageIndex: 0,
        traceId: null,
        traceStep: 0,
        tracePlaying: false,
        undoStack: [],
        redoStack: [],
      });
      return;
    }

    const refArch =
      referenceArchitectures.find((a) => a.id === id) ??
      s.cloudArchitectures.find((c) => c.isReference && (c.id === id || c.slug === id))?.dslJson;

    if (refArch) {
      set({
        architectureId: refArch.id,
        localDraftText: savedLocalDraft,
        activeLayers: new Set(refArch.layers),
        selectedId: null,
        stageIndex: 0,
        traceId: null,
        traceStep: 0,
        tracePlaying: false,
        undoStack: [],
        redoStack: [],
      });
      return;
    }

    const cloud = s.cloudArchitectures.find((c) => c.id === id || c.slug === id);
    if (!cloud) return;

    const parsed = parseArchitectureText(cloud.yamlSource);
    const arch = parsed.arch ?? cloud.dslJson;
    set({
      architectureId: cloud.id,
      localDraftText: savedLocalDraft,
      draftText: cloud.yamlSource,
      draftTextRev: s.draftTextRev + 1,
      draft: arch,
      diagnostics: parsed.diagnostics,
      activeLayers: new Set(arch.layers),
      selectedId: null,
      stageIndex: 0,
      traceId: null,
      traceStep: 0,
      tracePlaying: false,
      undoStack: [],
      redoStack: [],
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
  setDraftText: (text) =>
    set((s) => ({
      draftText: text,
      ...(s.architectureId === CUSTOM_ID ? { localDraftText: text } : {}),
    })),

  // A new document starts a new history: old undo steps would not apply to it.
  loadDraftText: (text) =>
    set((s) => ({
      draftText: text,
      ...(s.architectureId === CUSTOM_ID ? { localDraftText: text } : {}),
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
    const merge =
      coalesceKey !== undefined &&
      top?.key === coalesceKey &&
      top.after === s.draftText &&
      now - top.at < COALESCE_MS;
    const undoStack = merge
      ? [...s.undoStack.slice(0, -1), { ...top, after: result.text, at: now }]
      : [
          ...s.undoStack.slice(-(MAX_HISTORY - 1)),
          { before: s.draftText, after: result.text, key: coalesceKey, at: now },
        ];

    set({
      draftText: result.text,
      ...(s.architectureId === CUSTOM_ID ? { localDraftText: result.text } : {}),
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
    const item =
      after.draft &&
      [...after.draft.nodes, ...after.draft.groups].find((x) => x.id === result.select);
    if (item && !after.activeLayers.has(item.layer)) {
      set({ activeLayers: new Set([...after.activeLayers, item.layer]) });
    }
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
    if (isDraftBackedState(s)) {
      if (s.resetLayersOnParse) {
        patch.activeLayers = new Set(arch.layers);
      } else {
        // Keep the user's toggles for layers that still exist; show newly added layers.
        const before = new Set(s.draft?.layers ?? []);
        patch.activeLayers = new Set(
          arch.layers.filter((l) => !before.has(l) || s.activeLayers.has(l)),
        );
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

  bootstrapWorkspace: async () => {
    const url = new URL(window.location.href);
    const authError = url.searchParams.get('auth_error');
    const requestedArch = url.searchParams.get('arch');

    if (authError) {
      url.searchParams.delete('auth_error');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
      const friendly: Record<string, string> = {
        google_not_configured:
          'Google OAuth is not configured on the API server yet (.env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).',
        oauth_failed: 'Google sign-in failed. Please try again.',
        missing_code_or_state: 'Google sign-in callback was incomplete.',
      };
      set({ notice: friendly[authError] ?? `Sign-in notice: ${authError}` });
    }

    try {
      const [user, archList] = await Promise.all([api.auth.getMe(), api.architectures.list()]);
      const companies = user ? await api.companies.list() : [];
      set({
        authLoaded: true,
        apiAvailable: true,
        user,
        companies,
        cloudArchitectures: archList,
      });

      if (requestedArch) {
        const match = archList.find(
          (a) => a.id === requestedArch || a.slug === requestedArch,
        );
        if (match) {
          get().setArchitecture(match.isReference ? match.slug : match.id);
        } else {
          try {
            const direct = await api.architectures.getOne(requestedArch);
            get().upsertCloudArchitecture(direct, true);
          } catch {
            // Keep default architecture if slug is unreachable.
          }
        }
      }
    } catch {
      // Standalone frontend mode (API offline): reference architectures + local draft still work cleanly.
      set({ authLoaded: true, apiAvailable: false });
    }
  },

  refreshCloudData: async () => {
    try {
      const [user, archList] = await Promise.all([api.auth.getMe(), api.architectures.list()]);
      const companies = user ? await api.companies.list() : [];
      set({ user, companies, cloudArchitectures: archList, apiAvailable: true });
    } catch {
      // Ignore transient errors during refresh.
    }
  },

  logout: async () => {
    try {
      await api.auth.logout();
    } catch {
      // Proceed to clear client session state cleanly.
    }
    const s = get();
    const activeCloud = selectActiveCloud(s);
    set({
      user: null,
      companies: [],
      cloudArchitectures: s.cloudArchitectures.filter((a) => a.isReference || a.isPublic),
      notice: 'Signed out',
    });
    // If viewing a private architecture that requires authentication, return to reference gallery.
    if (activeCloud && !activeCloud.isReference && !activeCloud.isPublic) {
      get().setArchitecture(first.id);
      set({ appMode: 'explore' });
    }
  },

  switchActiveCompany: async (companyId) => {
    const updatedUser = await api.auth.setActiveCompany(companyId);
    const companyName = companyId
      ? get().companies.find((c) => c.id === companyId)?.name ?? 'Company'
      : 'Personal';
    set({ user: updatedUser, notice: `Workspace switched to ${companyName}` });
  },

  upsertCloudArchitecture: (record, selectIt = false) => {
    set((s) => {
      const exists = s.cloudArchitectures.some((c) => c.id === record.id);
      const next = exists
        ? s.cloudArchitectures.map((c) => (c.id === record.id ? record : c))
        : [record, ...s.cloudArchitectures];
      return { cloudArchitectures: next };
    });
    if (selectIt) {
      get().setArchitecture(record.id);
    }
  },

  removeCloudArchitecture: (id) => {
    const s = get();
    const next = s.cloudArchitectures.filter((c) => c.id !== id);
    set({ cloudArchitectures: next });
    if (s.architectureId === id) {
      get().setArchitecture(first.id);
      set({ appMode: 'explore' });
    }
  },

  saveCurrentCloudArchitecture: async () => {
    const s = get();
    const active = selectActiveCloud(s);
    if (!active || active.isReference) return false;
    if (!active.permissions.canEdit) {
      set({ notice: active.permissions.reason ?? 'You do not have permission to save changes.' });
      return false;
    }

    set({ savingCloud: true });
    try {
      const updated = await api.architectures.update(active.id, {
        yamlSource: s.draftText,
      });
      get().upsertCloudArchitecture(updated);
      set({ savingCloud: false, notice: 'Saved changes to cloud' });
      return true;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Failed to save changes';
      set({ savingCloud: false, notice: message });
      return false;
    }
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
    useAtlasStore.setState({
      undoStack: [],
      redoStack: [],
      notice: 'Canvas history cleared: the YAML was edited by hand.',
    });
    return;
  }
  const text = direction === 'undo' ? entry.before : entry.after;
  const moved = { ...entry, key: undefined };
  useAtlasStore.setState({
    draftText: text,
    ...(s.architectureId === CUSTOM_ID ? { localDraftText: text } : {}),
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
