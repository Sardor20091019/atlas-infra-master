import { lazy, Suspense, useEffect, useRef } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { architectures } from './architectures';
import { CUSTOM_ID, historyState, useAtlasStore } from './store/useAtlasStore';
import { useArchitecture } from './store/useArchitecture';
import { useDraftSync } from './store/useDraftSync';
import { editCopy, shareUrl } from './store/draftActions';
import { toYaml } from './dsl/parse';
import { Canvas } from './components/Canvas';
import { DetailCard } from './components/DetailCard';
import { Palette } from './components/Palette';

// CodeMirror is only loaded once someone toggles the YAML editor in build mode.
const EditorPanel = lazy(() => import('./editor/EditorPanel'));

export default function App() {
  useDraftSync();
  const selectRef = useRef<HTMLSelectElement>(null);

  const architectureId = useAtlasStore((s) => s.architectureId);
  const setArchitecture = useAtlasStore((s) => s.setArchitecture);
  const appMode = useAtlasStore((s) => s.appMode);
  const setAppMode = useAtlasStore((s) => s.setAppMode);
  const editorOpen = useAtlasStore((s) => s.editorOpen);
  const setEditorOpen = useAtlasStore((s) => s.setEditorOpen);
  const draftName = useAtlasStore((s) => s.draft?.name);
  const draftText = useAtlasStore((s) => s.draftText);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const select = useAtlasStore((s) => s.select);
  const setNotice = useAtlasStore((s) => s.setNotice);
  const stopTrace = useAtlasStore((s) => s.stopTrace);

  const canUndo = useAtlasStore((s) => historyState(s).canUndo);
  const canRedo = useAtlasStore((s) => historyState(s).canRedo);
  const undo = useAtlasStore((s) => s.undo);
  const redo = useAtlasStore((s) => s.redo);
  const arch = useArchitecture();

  const isDraft = architectureId === CUSTOM_ID;
  const isBuild = appMode === 'build';

  // Global Keyboard Navigation: Cmd/Ctrl+K to switch architectures, Esc to deselect / exit trace
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        selectRef.current?.focus();
        return;
      }

      if (e.key === 'Escape' && !isInput) {
        if (selectedId) select(null);
        stopTrace();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, select, stopTrace]);

  const onShare = async () => {
    const textToShare = isDraft ? draftText : arch ? toYaml(arch) : '';
    if (!textToShare) return;
    try {
      const url = shareUrl(textToShare);
      await navigator.clipboard.writeText(url);
      setNotice('Shareable link copied to clipboard');
    } catch {
      setNotice('Unable to copy link to clipboard');
    }
  };

  const handleSwitchToBuild = () => {
    if (!isDraft && arch) {
      editCopy(arch);
    }
    setAppMode('build');
  };

  return (
    <div className={`app mode-${appMode}`}>
      {/* 3-Cluster Topbar: Zero Clutter, Instrument Typography */}
      <header className="topbar">
        {/* Cluster 1: Brand + Architecture Switcher */}
        <div className="topbar-cluster-brand">
          <div className="brand" title="Atlas Infra">
            <span className="brand-reticle" aria-hidden="true">
              ✛
            </span>
            <span className="brand-name">Atlas Infra</span>
          </div>

          <span className="topbar-sep" aria-hidden="true">
            /
          </span>

          <div className="arch-switcher">
            <select
              ref={selectRef}
              value={architectureId}
              onChange={(e) => {
                const nextId = e.target.value;
                setArchitecture(nextId);
                if (nextId !== CUSTOM_ID) setAppMode('explore');
              }}
              aria-label="Select Architecture (Cmd+K)"
            >
              <optgroup label="Reference Gallery">
                {architectures.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Workspace Draft">
                <option value={CUSTOM_ID}>✎ {draftName ?? 'Custom Draft'}</option>
              </optgroup>
            </select>
            <span className="arch-switcher-caret" aria-hidden="true">
              ▾
            </span>
            <span className="key-hint topbar-keyhint">⌘K</span>
          </div>
        </div>

        {/* Cluster 2: Segmented Mode Toggle (Explore vs. Build) */}
        <div className="topbar-cluster-mode">
          <div className="mode-toggle" role="tablist" aria-label="Application Mode">
            <button
              className={`mode-btn${appMode === 'explore' ? ' active' : ''}`}
              onClick={() => setAppMode('explore')}
              role="tab"
              aria-selected={appMode === 'explore'}
            >
              Explore
            </button>
            <button
              className={`mode-btn${appMode === 'build' ? ' active' : ''}`}
              onClick={handleSwitchToBuild}
              role="tab"
              aria-selected={appMode === 'build'}
              title={!isDraft ? 'Clone architecture into an editable draft' : 'Toggle visual build mode'}
            >
              Build
            </button>
          </div>
        </div>

        {/* Cluster 3: Primary Actions (Share in Explore; YAML & Undo in Build) */}
        <div className="topbar-cluster-actions">
          {isBuild ? (
            <>
              <button
                className={`action-btn${editorOpen ? ' active' : ''}`}
                onClick={() => setEditorOpen(!editorOpen)}
                title="Toggle split YAML spec editor"
              >
                <code>{'{ }'}</code>
                <span>YAML</span>
              </button>
              <div className="action-group">
                <button
                  className="action-btn icon-only"
                  onClick={undo}
                  disabled={!canUndo}
                  title="Undo canvas edit (Ctrl+Z)"
                  aria-label="Undo"
                >
                  ↶
                </button>
                <button
                  className="action-btn icon-only"
                  onClick={redo}
                  disabled={!canRedo}
                  title="Redo canvas edit (Ctrl+Shift+Z)"
                  aria-label="Redo"
                >
                  ↷
                </button>
              </div>
              <button className="action-btn primary" onClick={onShare} title="Copy shareable link">
                Share
              </button>
            </>
          ) : (
            <button className="action-btn primary" onClick={onShare} title="Copy shareable link">
              Share
            </button>
          )}
        </div>
      </header>

      {/* Main Layout: 85%+ Viewport by Default */}
      <main
        className={`layout mode-${appMode}${isBuild && editorOpen ? ' with-editor' : ''}${selectedId ? ' with-selection' : ''}`}
      >
        {/* Builder Palette (docked left ONLY in Build mode) */}
        {isBuild && (
          <aside className="build-sidebar">
            <Palette />
          </aside>
        )}

        {/* Center Canvas: Spacious & Breathing */}
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>

        {/* Right Panel: EditorPanel in Build mode when open; or focused museum reading sheet */}
        {isBuild && editorOpen ? (
          <Suspense fallback={<aside className="editor-panel muted">Loading editor…</aside>}>
            <EditorPanel />
          </Suspense>
        ) : (
          <DetailCard />
        )}
      </main>
    </div>
  );
}
