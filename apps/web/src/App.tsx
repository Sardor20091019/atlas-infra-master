import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { toYaml } from '@atlas/shared';
import {
  isDraftBackedState,
  selectActiveCloud,
  useAtlasStore,
} from './store/useAtlasStore';
import { useArchitecture } from './store/useArchitecture';
import { useDraftSync } from './store/useDraftSync';
import { cloudShareUrl, shareUrl } from './store/draftActions';
import { Canvas } from './components/Canvas';
import { CompanyDrawer } from './components/CompanyDrawer';
import { DetailCard } from './components/DetailCard';
import { SaveArchitectureModal } from './components/SaveArchitectureModal';
import { WorkbenchSidebar } from './components/WorkbenchSidebar';

// CodeMirror is only loaded once someone toggles the YAML drawer in build mode.
const EditorPanel = lazy(() => import('./editor/EditorPanel'));

export default function App() {
  useDraftSync();
  const selectRef = useRef<HTMLSelectElement>(null);

  const architectureId = useAtlasStore((s) => s.architectureId);
  const appMode = useAtlasStore((s) => s.appMode);
  const editorOpen = useAtlasStore((s) => s.editorOpen);
  const draftText = useAtlasStore((s) => s.draftText);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const select = useAtlasStore((s) => s.select);
  const setNotice = useAtlasStore((s) => s.setNotice);
  const stopTrace = useAtlasStore((s) => s.stopTrace);
  const cloudArchitectures = useAtlasStore((s) => s.cloudArchitectures);

  const arch = useArchitecture();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [companyDrawerOpen, setCompanyDrawerOpen] = useState(false);
  const [saveModal, setSaveModal] = useState<{ open: boolean; mode: 'create' | 'settings' }>({
    open: false,
    mode: 'create',
  });

  const activeCloud = selectActiveCloud({ architectureId, cloudArchitectures });
  const isDraftBacked = isDraftBackedState({ architectureId, cloudArchitectures });
  const isBuild = appMode === 'build';
  const showYamlDrawer = isBuild && editorOpen && !sidebarCollapsed;

  // Global Keyboard Navigation: Cmd/Ctrl+K to switch architectures, `[` to collapse sidebar, Esc to close/stop trace
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (sidebarCollapsed) setSidebarCollapsed(false);
        window.setTimeout(() => selectRef.current?.focus(), 20);
        return;
      }

      if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !isInput) {
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
        return;
      }

      if (e.key === 'Escape' && !isInput && !companyDrawerOpen && !saveModal.open) {
        if (selectedId) select(null);
        stopTrace();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, select, stopTrace, companyDrawerOpen, saveModal.open, sidebarCollapsed]);

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

  return (
    <div className={`workbench-app mode-${appMode}`}>
      {/* Zone A: Left Control Rail */}
      <WorkbenchSidebar
        selectRef={selectRef}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onOpenCompanies={() => setCompanyDrawerOpen(true)}
        onOpenSaveModal={(mode) => setSaveModal({ open: true, mode })}
        onShare={() => void onShare()}
      />

      {/* Toggleable Live YAML Drawer docked cleanly beside the left rail in Build mode */}
      {showYamlDrawer && (
        <Suspense fallback={<aside className="editor-panel muted">Loading YAML editor…</aside>}>
          <EditorPanel />
        </Suspense>
      )}

      {/* Zone B: Pure Edge-to-Edge Canvas + Contextual Right Sheet */}
      <main className="workbench-stage">
        <ReactFlowProvider>
          <Canvas
            sidebarCollapsed={sidebarCollapsed}
            onExpandSidebar={() => setSidebarCollapsed(false)}
          />
        </ReactFlowProvider>
        <DetailCard />
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
