import { useEffect, useState, type FormEvent } from 'react';
import {
  canCreateCompanyArchitecture,
  toYaml,
  type Diagnostic,
} from '@atlas/shared';
import { api, ApiError } from '../api/client';
import { useArchitecture } from '../store/useArchitecture';
import {
  CUSTOM_ID,
  selectActiveCloud,
  useAtlasStore,
} from '../store/useAtlasStore';

interface SaveArchitectureModalProps {
  open: boolean;
  mode: 'create' | 'settings';
  onClose: () => void;
}

export function SaveArchitectureModal({ open, mode, onClose }: SaveArchitectureModalProps) {
  const user = useAtlasStore((s) => s.user);
  const companies = useAtlasStore((s) => s.companies);
  const architectureId = useAtlasStore((s) => s.architectureId);
  const draftText = useAtlasStore((s) => s.draftText);
  const draft = useAtlasStore((s) => s.draft);
  const activeCloud = useAtlasStore((s) => selectActiveCloud(s));
  const upsertCloudArchitecture = useAtlasStore((s) => s.upsertCloudArchitecture);
  const removeCloudArchitecture = useAtlasStore((s) => s.removeCloudArchitecture);
  const setNotice = useAtlasStore((s) => s.setNotice);
  const setAppMode = useAtlasStore((s) => s.setAppMode);
  const arch = useArchitecture();

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [companyId, setCompanyId] = useState<string>('');
  const [isPublic, setIsPublic] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);

  const editableCompanies = companies.filter((c) => canCreateCompanyArchitecture(c.myRole));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setDiagnostics([]);
    setConfirmDelete(false);

    if (mode === 'settings' && activeCloud && !activeCloud.isReference) {
      setTitle(activeCloud.title);
      setSlug(activeCloud.slug);
      setSummary(activeCloud.summary);
      setCompanyId(activeCloud.companyId ?? '');
      setIsPublic(activeCloud.isPublic);
      return;
    }

    const baseName =
      architectureId === CUSTOM_ID
        ? draft?.name ?? 'Untitled Architecture'
        : arch?.name
          ? `${arch.name} (Copy)`
          : 'New Architecture';
    const baseDesc =
      architectureId === CUSTOM_ID ? draft?.description ?? '' : arch?.description ?? '';
    setTitle(baseName);
    setSlug('');
    setSummary(baseDesc);
    setIsPublic(false);

    const activeEditable =
      user?.activeCompanyId &&
      editableCompanies.some((c) => c.id === user.activeCompanyId)
        ? user.activeCompanyId
        : '';
    setCompanyId(activeEditable);
  }, [open, mode, activeCloud, architectureId, draft, arch, user, companies]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  if (!user) {
    return (
      <div className="drawer-backdrop" onMouseDown={onClose}>
        <div
          className="modal-card"
          role="dialog"
          aria-modal="true"
          aria-label="Sign in required"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="drawer-header">
            <div className="drawer-header-text">
              <span className="drawer-eyebrow tabular">CLOUD WORKSPACE</span>
              <h2 className="drawer-title">Sign in to Save to Cloud</h2>
            </div>
            <button type="button" className="placard-close-btn" onClick={onClose}>
              <span className="close-x">×</span>
            </button>
          </div>
          <div className="modal-body">
            <p className="modal-copy">
              Your local draft stays saved in this browser. Sign in with Google to save architectures
              to your account, publish public links, or collaborate inside a company workspace.
            </p>
            <div className="drawer-form-actions">
              <button type="button" className="action-btn" onClick={onClose}>
                Continue Local Draft
              </button>
              <a href={api.auth.getGoogleLoginUrl()} className="action-btn primary">
                Sign in with Google
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDiagnostics([]);
    setSubmitting(true);

    try {
      if (mode === 'settings' && activeCloud && !activeCloud.isReference) {
        const updated = await api.architectures.update(activeCloud.id, {
          title: title.trim(),
          ...(slug.trim() ? { slug: slug.trim() } : {}),
          summary: summary.trim(),
          isPublic,
          companyId: companyId || null,
        });
        upsertCloudArchitecture(updated);
        setNotice('Architecture settings updated');
        onClose();
        return;
      }

      const yamlSource =
        architectureId === CUSTOM_ID || (activeCloud && !activeCloud.isReference)
          ? draftText
          : arch
            ? toYaml(arch)
            : draftText;

      const created = await api.architectures.create({
        title: title.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        summary: summary.trim(),
        isPublic,
        companyId: companyId || null,
        yamlSource,
      });

      upsertCloudArchitecture(created, true);
      setAppMode('build');
      setNotice(
        created.companyName
          ? `Published to ${created.companyName}`
          : 'Saved to your Personal cloud workspace',
      );
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.diagnostics) setDiagnostics(err.diagnostics);
      } else {
        setError('Failed to save architecture');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!activeCloud || activeCloud.isReference) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.architectures.remove(activeCloud.id);
      removeCloudArchitecture(activeCloud.id);
      setNotice(`Deleted "${activeCloud.title}"`);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete architecture');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'settings' ? 'Architecture Settings' : 'Save Architecture to Cloud'}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-header-text">
            <span className="drawer-eyebrow tabular">
              {mode === 'settings' ? 'ARCHITECTURE SETTINGS' : 'SAVE OR PUBLISH'}
            </span>
            <h2 className="drawer-title">
              {mode === 'settings' ? activeCloud?.title ?? 'Settings' : 'Save to Cloud'}
            </h2>
          </div>
          <button type="button" className="placard-close-btn" onClick={onClose}>
            <span className="key-hint">ESC</span>
            <span className="close-x">×</span>
          </button>
        </div>

        <form className="modal-body drawer-form" onSubmit={(e) => void handleSubmit(e)}>
          {error && <div className="drawer-alert error">{error}</div>}
          {diagnostics.length > 0 && (
            <ul className="modal-diagnostics tabular">
              {diagnostics.slice(0, 4).map((d, i) => (
                <li key={i}>
                  L{d.line}: {d.message}
                </li>
              ))}
            </ul>
          )}

          <label className="form-field">
            <span className="form-label">Title</span>
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Production API Cluster"
            />
          </label>

          <label className="form-field">
            <span className="form-label">Slug (optional URL identifier)</span>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-generated-from-title"
            />
          </label>

          <label className="form-field">
            <span className="form-label">Summary</span>
            <textarea
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Concise explanation of scale, boundaries, and key trade-offs."
            />
          </label>

          <label className="form-field">
            <span className="form-label">Workspace Scope</span>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Personal Workspace</option>
              {companies.map((c) => {
                const writable = canCreateCompanyArchitecture(c.myRole);
                return (
                  <option key={c.id} value={c.id} disabled={!writable}>
                    {c.name} ({c.myRole}
                    {writable ? '' : ' — read-only'})
                  </option>
                );
              })}
            </select>
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <div>
              <div className="checkbox-title">Publicly readable</div>
              <div className="checkbox-sub">
                Anyone with the link can inspect this architecture in read-only mode.
              </div>
            </div>
          </label>

          <div className="drawer-form-actions split">
            {mode === 'settings' && activeCloud?.permissions.canDelete ? (
              !confirmDelete ? (
                <button
                  type="button"
                  className="action-btn danger-outline"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              ) : (
                <button
                  type="button"
                  className="action-btn danger-solid"
                  disabled={submitting}
                  onClick={() => void handleDelete()}
                >
                  Confirm Delete
                </button>
              )
            ) : (
              <span />
            )}

            <div className="drawer-form-actions">
              <button type="button" className="action-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="action-btn primary" disabled={submitting}>
                {submitting
                  ? 'Saving…'
                  : mode === 'settings'
                    ? 'Save Settings'
                    : companyId
                      ? 'Publish to Company'
                      : 'Save to Personal'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
