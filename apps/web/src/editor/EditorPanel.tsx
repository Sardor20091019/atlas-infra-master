import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { BLANK_TEMPLATE, formatYaml, locateItem } from '@atlas/shared';
import { CUSTOM_ID, selectActiveCloud, useAtlasStore } from '../store/useAtlasStore';
import { replaceDraft, shareUrl } from '../store/draftActions';
import { DetailCard } from '../components/DetailCard';
import { YamlEditor, type YamlEditorHandle } from './YamlEditor';

type Tab = 'yaml' | 'details';

/** Above this, share links get unreliable in chat apps and some browsers. */
const MAX_SHARE_URL = 8000;

export default function EditorPanel() {
  const architectureId = useAtlasStore((s) => s.architectureId);
  const draftText = useAtlasStore((s) => s.draftText);
  const draftTextRev = useAtlasStore((s) => s.draftTextRev);
  const draftEditRev = useAtlasStore((s) => s.draftEditRev);
  const diagnostics = useAtlasStore((s) => s.diagnostics);
  const draft = useAtlasStore((s) => s.draft);
  const selectedId = useAtlasStore((s) => s.selectedId);
  const setDraftText = useAtlasStore((s) => s.setDraftText);
  const loadDraftText = useAtlasStore((s) => s.loadDraftText);
  const activeCloud = useAtlasStore((s) => selectActiveCloud(s));

  const isLocalScratch = architectureId === CUSTOM_ID;
  const canWriteText = isLocalScratch || Boolean(activeCloud?.permissions.canEdit);

  const editor = useRef<YamlEditorHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>('yaml');
  const [notice, setNotice] = useState<string | null>(null);

  // Text replaced from outside (template, import, share link, canvas edits) flows into the editor.
  useEffect(() => {
    editor.current?.replace(useAtlasStore.getState().draftText);
  }, [draftTextRev, draftEditRev]);

  useEffect(() => {
    editor.current?.showDiagnostics(diagnostics);
  }, [diagnostics]);

  // Clicking a node or group on the canvas jumps to its definition.
  useEffect(() => {
    if (!selectedId || tab !== 'yaml') return;
    const range = locateItem(useAtlasStore.getState().draftText, selectedId);
    if (range) editor.current?.reveal(range[0], range[1]);
  }, [selectedId, tab]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warning');

  const onFormat = () => {
    if (!canWriteText) return;
    const out = formatYaml(draftText);
    if (out === undefined) setNotice('Fix syntax errors before formatting');
    else loadDraftText(out);
  };

  const onShare = async () => {
    const url = shareUrl(draftText);
    if (url.length > MAX_SHARE_URL) {
      setNotice('Document too large for URL payload; download YAML instead');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Shareable link copied to clipboard');
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const onDownload = () => {
    const blob = new Blob([draftText], { type: 'text/yaml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${draft?.id ?? 'architecture'}.yaml`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !canWriteText) return;
    const text = await file.text();
    if (isLocalScratch) {
      replaceDraft(text, `"${file.name}"`);
    } else {
      loadDraftText(text);
    }
  };

  return (
    <aside className="editor-panel" aria-label="Architecture DSL Workspace">
      <div className="editor-tabs">
        <button
          className={tab === 'yaml' ? 'on' : ''}
          onClick={() => setTab('yaml')}
          aria-selected={tab === 'yaml'}
        >
          YAML Spec
        </button>
        <button
          className={tab === 'details' ? 'on' : ''}
          onClick={() => setTab('details')}
          aria-selected={tab === 'details'}
        >
          Inspector
        </button>
        <span
          className={`editor-status tabular ${errors.length ? 'bad' : warnings.length ? 'warn' : 'ok'}`}
        >
          {!canWriteText
            ? 'READ ONLY'
            : errors.length
              ? `✕ ${errors.length} error${errors.length > 1 ? 's' : ''}${draft ? ' · showing last valid' : ''}`
              : warnings.length
                ? `! ${warnings.length} warning${warnings.length > 1 ? 's' : ''}`
                : `✓ Validated · ${draft?.nodes.length ?? 0} nodes`}
        </span>
      </div>

      <div className="editor-toolbar">
        {isLocalScratch && (
          <button
            onClick={() => replaceDraft(BLANK_TEMPLATE, 'the starter template')}
            title="Reset local draft to starter template"
          >
            New
          </button>
        )}
        {canWriteText && (
          <>
            <button onClick={() => fileInput.current?.click()} title="Import a .yaml or .json file">
              Import
            </button>
            <button onClick={onFormat} title="Format and re-indent YAML source">
              Format
            </button>
          </>
        )}
        <button onClick={onDownload} title="Export as standalone .yaml file">
          Download
        </button>
        <button onClick={onShare} title="Generate compressed URL link for sharing">
          Share Link
        </button>
        {notice && <span className="editor-notice tabular">{notice}</span>}
        <input ref={fileInput} type="file" accept=".yaml,.yml,.json" hidden onChange={onImport} />
      </div>

      {/* Kept mounted while on the Details tab so undo history and scroll survive. */}
      <div className="editor-body" hidden={tab !== 'yaml'}>
        <YamlEditor
          ref={editor}
          initialText={draftText}
          onChange={setDraftText}
          readOnly={!canWriteText}
        />
      </div>
      {tab === 'details' && <DetailCard />}

      {tab === 'yaml' && diagnostics.length > 0 && (
        <ul className="editor-issues" role="alert" aria-label="Syntax diagnostics">
          {diagnostics.map((d, i) => (
            <li key={i} className={d.severity} onClick={() => editor.current?.reveal(d.from, d.to, true)}>
              <span className="issue-line tabular">L{d.line}</span>
              <span className="issue-msg">{d.message}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
