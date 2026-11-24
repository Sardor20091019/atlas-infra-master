import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { referenceArchitectures, toYaml } from '@atlas/shared';
import {
  CUSTOM_ID,
  historyState,
  isDraftBackedState,
  selectActiveCloud,
  useAtlasStore,
} from './store/useAtlasStore';
import { useArchitecture } from './store/useArchitecture';
import { useCanEdit } from './store/useCanEdit';
import { useDraftSync } from './store/useDraftSync';
import { cloudShareUrl, editCopy, shareUrl } from './store/draftActions';
import { AccountMenu } from './components/AccountMenu';
import { Canvas } from './components/Canvas';
import { CompanyDrawer } from './components/CompanyDrawer';
import { DetailCard } from './components/DetailCard';
import { Palette } from './components/Palette';
import { SaveArchitectureModal } from './components/SaveArchitectureModal';

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
  const user = useAtlasStore((s) => s.user);
  const companies = useAtlasStore((s) => s.companies);
  const cloudArchitectures = useAtlasStore((s) => s.cloudArchitectures);
  const savingCloud = useAtlasStore((s) => s.savingCloud);
  const saveCurrentCloudArchitecture = useAtlasStore((s) => s.saveCurrentCloudArchitecture);

  const canUndo = useAtlasStore((s) => historyState(s).canUndo);
  const canRedo = useAtlasStore((s) => historyState(s).canRedo);
  const undo = useAtlasStore((s) => s.undo);
  const redo = useAtlasStore((s) => s.redo);

  const arch = useArchitecture();
  const { canEdit } = useCanEdit();

  const [companyDrawerOpen, setCompanyDrawerOpen] = useState(false);
  const [saveModal, setSaveModal] = useState<{ open: boolean; mode: 'create' | 'settings' }>({
    open: false,
    mode: 'create',
  });

  const isLocalScratch = architectureId === CUSTOM_ID;
  const activeCloud = selectActiveCloud({ architectureId, cloudArchitectures });
  const isEditableCloud = Boolean(activeCloud && !activeCloud.isReference && activeCloud.permissions.canEdit);
  const isDraftBacked = isDraftBackedState({ architectureId, cloudArchitectures });
  const isBuild = appMode === 'build';
  const isDirtyCloud = Boolean(
    isEditableCloud && activeCloud && draftText !== activeCloud.yamlSource,
  );

  // Separate non-reference cloud architectures cleanly by personal vs company
  const personalCloud = cloudArchitectures.filter(
    (a) => !a.isReference && a.companyId === null && (!user || a.ownerUserId === user.id),
  );
  const publicCommunityCloud = cloudArchitectures.filter(
    (a) => !a.isReference && a.companyId === null && user && a.ownerUserId !== user.id,
  );
  const companyBuckets = companies
    .map((c) => ({
      company: c,
      items: cloudArchitectures.filter((a) => !a.isReference && a.companyId === c.id),
    }))
    .filter((b) => b.items.length > 0);
  const otherCompanyPublic = cloudArchitectures.filter(
    (a) =>
      !a.isReference &&
      a.companyId !== null &&
      !companies.some((c) => c.id === a.companyId),
  );

  const activeCompany = user?.activeCompanyId
    ? companies.find((c) => c.id === user.activeCompanyId)
    : undefined;

  // Global Keyboard Navigation: Cmd/Ctrl+K to switch architectures, Esc to deselect / exit trace
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        selectRef.current?.focus();
        return;
      }

      if (e.key === 'Escape' && !isInput && !companyDrawerOpen && !saveModal.open) {
        if (selectedId) select(null);
        stopTrace();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, select, stopTrace, companyDrawerOpen, saveModal.open]);

  const onShare = async () => {
    const url =
      activeCloud && !activeCloud.isReference && activeCloud.isPublic
        ? cloudShareUrl(activeCloud.slug)
        : (() => {
            const textToShare = isDraftBacked ? draftText : arch ? toYaml(arch) : '';
            return textToShare ? shareUrl(textToShare) : '';
          })();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Shareable link copied to clipboard');
    } catch {
      setNotice('Unable to copy link to clipboard');
    }
  };

  const handleSwitchToBuild = () => {
    if (!isDraftBacked && arch) {
      editCopy(arch);
    }
    setAppMode('build');
  };

  const handleForkToLocal = () => {
    if (!arch) return;
    editCopy(arch);
    setAppMode('build');
  };

  return (
    <div className={`app mode-${appMode}`}>
      {/* 3-Cluster Topbar: Calm Editorial Hierarchy */}
      <header className="topbar">
        {/* Cluster 1: Brand + Architecture Switcher + Quiet Workspace Pill */}
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
                const nextCloud = cloudArchitectures.find(
                  (c) => c.id === nextId || (c.isReference && c.slug === nextId),
                );
                if (nextId !== CUSTOM_ID && (!nextCloud || nextCloud.isReference)) {
                  setAppMode('explore');
                }
              }}
              aria-label="Select Architecture (Cmd+K)"
            >
              <optgroup label="Reference Gallery">
                {referenceArchitectures.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>

              {personalCloud.length > 0 && (
                <optgroup label={user ? 'Personal Cloud' : 'Public Cloud'}>
                  {personalCloud.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                      {a.isPublic ? ' · Public' : ''}
                    </option>
                  ))}
                </optgroup>
              )}

              {companyBuckets.map(({ company, items }) => (
                <optgroup key={company.id} label={`${company.name} (${company.myRole})`}>
                  {items.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                    </option>
                  ))}
                </optgroup>
              ))}

              {(publicCommunityCloud.length > 0 || otherCompanyPublic.length > 0) && (
                <optgroup label="Shared Public">
                  {[...publicCommunityCloud, ...otherCompanyPublic].map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title}
                      {a.companyName ? ` (${a.companyName})` : ''}
                    </option>
                  ))}
                </optgroup>
              )}

              <optgroup label="Local Scratch Draft">
                <option value={CUSTOM_ID}>
                  ✎ {isLocalScratch ? draftName ?? 'Custom Draft' : 'Local Scratch Draft'}
                </option>
              </optgroup>
            </select>
            <span className="arch-switcher-caret" aria-hidden="true">
              ▾
            </span>
            <span className="key-hint topbar-keyhint">⌘K</span>
          </div>

          {user && (
            <button
              type="button"
              className="workspace-pill"
              onClick={() => setCompanyDrawerOpen(true)}
              title="Switch active company or manage members"
            >
              <span className="workspace-pill-dot" />
              <span className="workspace-pill-name">
                {activeCompany ? activeCompany.name : 'Personal'}
              </span>
              {activeCompany && (
                <span className="workspace-pill-role tabular">
                  {activeCompany.myRole.toUpperCase()}
                </span>
              )}
            </button>
          )}
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
              title={
                !isDraftBacked
                  ? 'Clone architecture into an editable local draft'
                  : 'Toggle visual build mode'
              }
            >
              Build
            </button>
          </div>
        </div>

        {/* Cluster 3: Primary Actions + Account Menu */}
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

              {canEdit && (
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
              )}

              {isEditableCloud && activeCloud ? (
                <>
                  <button
                    className={`action-btn${isDirtyCloud ? ' primary' : ''}`}
                    disabled={!isDirtyCloud || savingCloud}
                    onClick={() => void saveCurrentCloudArchitecture()}
                    title="Save YAML changes to cloud"
                  >
                    {savingCloud ? 'Saving…' : isDirtyCloud ? 'Save' : 'Saved'}
                  </button>
                  <button
                    className="action-btn"
                    onClick={() => setSaveModal({ open: true, mode: 'settings' })}
                    title="Visibility, workspace scope, or delete"
                  >
                    Settings
                  </button>
                </>
              ) : (
                <>
                  {activeCloud && !activeCloud.isReference && !activeCloud.permissions.canEdit && (
                    <button
                      className="action-btn"
                      onClick={handleForkToLocal}
                      title="Fork a local editable copy"
                    >
                      Fork Copy
                    </button>
                  )}
                  <button
                    className="action-btn"
                    onClick={() => setSaveModal({ open: true, mode: 'create' })}
                    title="Save or publish this architecture to cloud"
                  >
                    Save to Cloud
                  </button>
                </>
              )}

              <button className="action-btn" onClick={onShare} title="Copy shareable link">
                Share
              </button>
            </>
          ) : (
            <>
              {user && (
                <button
                  className="action-btn"
                  onClick={() => setSaveModal({ open: true, mode: 'create' })}
                  title="Fork a copy into Personal or Company workspace"
                >
                  Fork
                </button>
              )}
              <button className="action-btn primary" onClick={onShare} title="Copy shareable link">
                Share
              </button>
            </>
          )}

          <AccountMenu
            onOpenCompanies={() => setCompanyDrawerOpen(true)}
            onOpenSaveModal={() => setSaveModal({ open: true, mode: 'create' })}
          />
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

        {/* Right Panel: EditorPanel in Build mode when open; or focused reading sheet / Inspector */}
        {isBuild && editorOpen ? (
          <Suspense fallback={<aside className="editor-panel muted">Loading editor…</aside>}>
            <EditorPanel />
          </Suspense>
        ) : (
          <DetailCard />
        )}
      </main>

      <CompanyDrawer open={companyDrawerOpen} onClose={() => setCompanyDrawerOpen(false)} />
      <SaveArchitectureModal
        open={saveModal.open}
        mode={saveModal.mode}
        onClose={() => setSaveModal((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
