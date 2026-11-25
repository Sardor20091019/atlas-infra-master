import type { RefObject } from 'react';
import { referenceArchitectures } from '@atlas/shared';
import {
  CUSTOM_ID,
  historyState,
  isDraftBackedState,
  selectActiveCloud,
  useAtlasStore,
} from '../store/useAtlasStore';
import { useArchitecture } from '../store/useArchitecture';
import { useCanEdit } from '../store/useCanEdit';
import { editCopy } from '../store/draftActions';
import { AccountMenu } from './AccountMenu';
import { LayerPanel } from './LayerPanel';
import { Palette } from './Palette';
import { StageBar } from './StageBar';
import { TracePanel } from './TracePanel';

interface WorkbenchSidebarProps {
  selectRef: RefObject<HTMLSelectElement | null>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onOpenCompanies: () => void;
  onOpenSaveModal: (mode: 'create' | 'settings') => void;
  onShare: () => void;
}

export function WorkbenchSidebar({
  selectRef,
  collapsed,
  onToggleCollapse,
  onOpenCompanies,
  onOpenSaveModal,
  onShare,
}: WorkbenchSidebarProps) {
  const architectureId = useAtlasStore((s) => s.architectureId);
  const setArchitecture = useAtlasStore((s) => s.setArchitecture);
  const appMode = useAtlasStore((s) => s.appMode);
  const setAppMode = useAtlasStore((s) => s.setAppMode);
  const theme = useAtlasStore((s) => s.theme);
  const toggleTheme = useAtlasStore((s) => s.toggleTheme);
  const editorOpen = useAtlasStore((s) => s.editorOpen);
  const setEditorOpen = useAtlasStore((s) => s.setEditorOpen);
  const draftName = useAtlasStore((s) => s.draft?.name);
  const draftText = useAtlasStore((s) => s.draftText);
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

  const isLocalScratch = architectureId === CUSTOM_ID;
  const activeCloud = selectActiveCloud({ architectureId, cloudArchitectures });
  const isEditableCloud = Boolean(
    activeCloud && !activeCloud.isReference && activeCloud.permissions.canEdit,
  );
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

  const handleSwitchToBuild = () => {
    if (!isDraftBacked && arch) {
      editCopy(arch);
    }
    setAppMode('build');
  };

  const handleNewOrEditCopy = () => {
    if (!isDraftBacked && arch) {
      editCopy(arch);
      setAppMode('build');
      return;
    }
    if (isBuild) {
      setArchitecture(CUSTOM_ID);
      return;
    }
    setAppMode('build');
  };

  return (
    <aside
      className={`workbench-rail${collapsed ? ' collapsed' : ''}`}
      aria-label="Atlas Infra Workbench"
      aria-hidden={collapsed}
    >
      {/* 1. Brand & Workspace Context */}
      <div className="rail-header">
        <div className="rail-brand-row">
          <div className="brand" title="Atlas Infra">
            <span className="brand-reticle" aria-hidden="true">
              ✛
            </span>
            <span className="brand-name">Atlas Infra</span>
          </div>
          <div className="rail-brand-actions">
            <button
              type="button"
              className="rail-collapse-btn"
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.3" />
                  <path
                    d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M12.6 3.4l-.9.9M4.3 11.7l-.9.9"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M13.3 10.2A5.5 5.5 0 0 1 5.8 2.7a5.5 5.5 0 1 0 7.5 7.5Z"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="rail-collapse-btn"
              onClick={onToggleCollapse}
              title="Collapse sidebar ([)"
              aria-label="Collapse sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3" />
                <path d="M5.5 2.5v11" stroke="currentColor" strokeWidth="1.3" />
                <path d="M10.5 6.5 8.5 8l2 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="rail-context-row">
          {user && (
            <button
              type="button"
              className="workspace-pill"
              onClick={onOpenCompanies}
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
          <AccountMenu
            onOpenCompanies={onOpenCompanies}
            onOpenSaveModal={() => onOpenSaveModal('create')}
          />
        </div>
      </div>

      {/* 2. Architecture Gallery Switcher */}
      <div className="rail-block">
        <div className="rail-section-head">
          <span className="rail-section-title">Architecture</span>
          <span className="key-hint">⌘K</span>
        </div>

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
        </div>

        <div className="rail-gallery-actions">
          <button
            type="button"
            className="rail-secondary-btn"
            onClick={handleNewOrEditCopy}
            title={
              !isDraftBacked
                ? 'Clone this reference into an editable local copy'
                : 'Open local scratch draft'
            }
          >
            {!isDraftBacked ? '+ Edit Copy' : '+ New Draft'}
          </button>
          <button
            type="button"
            className="rail-secondary-btn"
            onClick={onShare}
            title="Copy shareable link"
          >
            Share Link
          </button>
        </div>
      </div>

      {/* 3. Mode Switcher (Segmented Control) */}
      <div className="rail-block rail-mode-block">
        <div className="mode-toggle" role="tablist" aria-label="Application Mode">
          <button
            type="button"
            className={`mode-btn${appMode === 'explore' ? ' active' : ''}`}
            onClick={() => setAppMode('explore')}
            role="tab"
            aria-selected={appMode === 'explore'}
          >
            Explore
          </button>
          <button
            type="button"
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

      {/* 4. Contextual Workspace */}
      <div className="rail-scroll">
        {isBuild ? (
          <div className="rail-build-workspace">
            <div className="rail-build-toolbar">
              <button
                type="button"
                className={`action-btn${editorOpen ? ' active' : ''}`}
                onClick={() => setEditorOpen(!editorOpen)}
                title="Toggle live YAML drawer"
              >
                <code>{'{ }'}</code>
                <span>YAML</span>
              </button>

              {canEdit && (
                <div className="action-group">
                  <button
                    type="button"
                    className="action-btn icon-only"
                    onClick={undo}
                    disabled={!canUndo}
                    title="Undo (Ctrl+Z)"
                    aria-label="Undo"
                  >
                    ↶
                  </button>
                  <button
                    type="button"
                    className="action-btn icon-only"
                    onClick={redo}
                    disabled={!canRedo}
                    title="Redo (Ctrl+Shift+Z)"
                    aria-label="Redo"
                  >
                    ↷
                  </button>
                </div>
              )}

              {isEditableCloud && activeCloud ? (
                <>
                  <button
                    type="button"
                    className={`action-btn${isDirtyCloud ? ' primary' : ''}`}
                    disabled={!isDirtyCloud || savingCloud}
                    onClick={() => void saveCurrentCloudArchitecture()}
                    title="Save YAML changes to cloud"
                  >
                    {savingCloud ? 'Saving…' : isDirtyCloud ? 'Save' : 'Saved'}
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    onClick={() => onOpenSaveModal('settings')}
                    title="Visibility, workspace scope, or delete"
                  >
                    Settings
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="action-btn primary"
                  onClick={() => onOpenSaveModal('create')}
                  title="Save or publish this architecture to cloud"
                >
                  Save to Cloud
                </button>
              )}
            </div>

            <Palette />
          </div>
        ) : (
          <div className="rail-explore-workspace">
            <StageBar />
            <TracePanel />
            <LayerPanel />
          </div>
        )}
      </div>

      {/* Quiet Footer in Explore Mode when signed in */}
      {!isBuild && user && (
        <div className="rail-footer">
          <button
            type="button"
            className="rail-footer-btn"
            onClick={() => onOpenSaveModal('create')}
            title="Fork a copy into Personal or Company workspace"
          >
            Fork to Workspace
          </button>
        </div>
      )}
    </aside>
  );
}
