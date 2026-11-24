import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  canDeleteCompany,
  canManageCompany,
  COMPANY_ROLES,
  type CompanyDetailDto,
  type CompanyRole,
} from '@atlas/shared';
import { api, ApiError } from '../api/client';
import { useAtlasStore } from '../store/useAtlasStore';

interface CompanyDrawerProps {
  open: boolean;
  onClose: () => void;
}

type ViewMode = 'list' | 'create' | 'manage';

export function CompanyDrawer({ open, onClose }: CompanyDrawerProps) {
  const user = useAtlasStore((s) => s.user);
  const companies = useAtlasStore((s) => s.companies);
  const switchActiveCompany = useAtlasStore((s) => s.switchActiveCompany);
  const refreshCloudData = useAtlasStore((s) => s.refreshCloudData);

  const [view, setView] = useState<ViewMode>('list');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompanyDetailDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Create company form
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newWebsite, setNewWebsite] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit company form
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Add member form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CompanyRole>('editor');
  const [inviting, setInviting] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null;

  const loadDetail = useCallback(async (companyId: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const d = await api.companies.getDetail(companyId);
      setDetail(d);
      setEditName(d.name);
      setEditSlug(d.slug);
      setEditDesc(d.description);
      setEditWebsite(d.website ?? '');
    } catch (err) {
      setDetail(null);
      if (err instanceof ApiError && err.status !== 403) {
        setError(err.message);
      }
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setStatusMsg(null);
      setConfirmDelete(false);
      return;
    }
    if (view === 'manage' && selectedCompanyId) {
      const summary = companies.find((c) => c.id === selectedCompanyId);
      if (summary && canManageCompany(summary.myRole)) {
        void loadDetail(selectedCompanyId);
      } else {
        setDetail(null);
      }
    }
  }, [open, view, selectedCompanyId, companies, loadDetail]);

  if (!open || !user) return null;

  const openManage = (companyId: string) => {
    setSelectedCompanyId(companyId);
    setConfirmDelete(false);
    setError(null);
    setStatusMsg(null);
    setView('manage');
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    setCreating(true);
    try {
      const created = await api.companies.create({
        name: newName,
        ...(newSlug.trim() ? { slug: newSlug.trim() } : {}),
        description: newDesc,
        website: newWebsite.trim() || null,
      });
      await refreshCloudData();
      setNewName('');
      setNewSlug('');
      setNewDesc('');
      setNewWebsite('');
      setStatusMsg(`Created "${created.name}"`);
      openManage(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create company');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateCompany = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) return;
    setError(null);
    setStatusMsg(null);
    setSavingEdit(true);
    try {
      await api.companies.update(selectedCompanyId, {
        name: editName,
        slug: editSlug,
        description: editDesc,
        website: editWebsite.trim() || null,
      });
      await refreshCloudData();
      await loadDetail(selectedCompanyId);
      setStatusMsg('Company details updated');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update company');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId) return;
    setError(null);
    setStatusMsg(null);
    setInviting(true);
    try {
      await api.companies.addMember(selectedCompanyId, {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail('');
      await refreshCloudData();
      await loadDetail(selectedCompanyId);
      setStatusMsg('Member added');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add member');
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (userId: string, role: CompanyRole) => {
    if (!selectedCompanyId) return;
    setError(null);
    setStatusMsg(null);
    try {
      await api.companies.updateMember(selectedCompanyId, userId, { role });
      await refreshCloudData();
      await loadDetail(selectedCompanyId);
      setStatusMsg('Member role updated');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!selectedCompanyId) return;
    setError(null);
    setStatusMsg(null);
    try {
      await api.companies.removeMember(selectedCompanyId, userId);
      await refreshCloudData();
      await loadDetail(selectedCompanyId);
      setStatusMsg('Member removed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove member');
    }
  };

  const handleDeleteCompany = async () => {
    if (!selectedCompanyId) return;
    setError(null);
    setDeleting(true);
    try {
      await api.companies.remove(selectedCompanyId);
      await refreshCloudData();
      setSelectedCompanyId(null);
      setDetail(null);
      setConfirmDelete(false);
      setView('list');
      setStatusMsg('Company deleted');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete company');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="workspace-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Companies and Workspaces"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-header-text">
            <span className="drawer-eyebrow tabular">WORKSPACES &amp; COMPANIES</span>
            <h2 className="drawer-title">
              {view === 'list'
                ? 'Active Scope'
                : view === 'create'
                  ? 'New Company'
                  : selectedCompany?.name ?? 'Company'}
            </h2>
          </div>
          <button type="button" className="placard-close-btn" onClick={onClose} title="Close (Esc)">
            <span className="key-hint">ESC</span>
            <span className="close-x">×</span>
          </button>
        </div>

        <div className="drawer-tabs">
          <button
            type="button"
            className={view === 'list' ? 'on' : ''}
            onClick={() => {
              setError(null);
              setView('list');
            }}
          >
            Workspaces ({companies.length + 1})
          </button>
          <button
            type="button"
            className={view === 'create' ? 'on' : ''}
            onClick={() => {
              setError(null);
              setView('create');
            }}
          >
            + New Company
          </button>
          {selectedCompany && (
            <button
              type="button"
              className={view === 'manage' ? 'on' : ''}
              onClick={() => setView('manage')}
            >
              Manage
            </button>
          )}
        </div>

        <div className="drawer-body">
          {error && <div className="drawer-alert error">{error}</div>}
          {statusMsg && <div className="drawer-alert ok">{statusMsg}</div>}

          {view === 'list' && (
            <div className="workspace-list">
              <div className={`workspace-card${user.activeCompanyId === null ? ' active' : ''}`}>
                <div className="workspace-card-main">
                  <div className="workspace-card-title">
                    <span>Personal Workspace</span>
                    <span className="role-pill tabular">OWNER</span>
                  </div>
                  <div className="workspace-card-sub tabular">{user.email}</div>
                </div>
                <div className="workspace-card-actions">
                  <button
                    type="button"
                    className={`action-btn${user.activeCompanyId === null ? ' active' : ''}`}
                    disabled={user.activeCompanyId === null}
                    onClick={() => void switchActiveCompany(null)}
                  >
                    {user.activeCompanyId === null ? 'Active' : 'Use'}
                  </button>
                </div>
              </div>

              {companies.map((c) => {
                const isActive = user.activeCompanyId === c.id;
                return (
                  <div key={c.id} className={`workspace-card${isActive ? ' active' : ''}`}>
                    <div className="workspace-card-main">
                      <div className="workspace-card-title">
                        <span>{c.name}</span>
                        <span className="role-pill tabular">{c.myRole.toUpperCase()}</span>
                      </div>
                      <div className="workspace-card-sub tabular">
                        @{c.slug} · {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
                      </div>
                      {c.description && <p className="workspace-card-desc">{c.description}</p>}
                    </div>
                    <div className="workspace-card-actions">
                      <button
                        type="button"
                        className={`action-btn${isActive ? ' active' : ''}`}
                        disabled={isActive}
                        onClick={() => void switchActiveCompany(c.id)}
                      >
                        {isActive ? 'Active' : 'Switch'}
                      </button>
                      <button
                        type="button"
                        className="action-btn"
                        onClick={() => openManage(c.id)}
                      >
                        {canManageCompany(c.myRole) ? 'Manage' : 'Details'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {view === 'create' && (
            <form className="drawer-form" onSubmit={(e) => void handleCreate(e)}>
              <label className="form-field">
                <span className="form-label">Company Name</span>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Acme Platform Engineering"
                />
              </label>

              <label className="form-field">
                <span className="form-label">Slug (optional)</span>
                <input
                  type="text"
                  value={newSlug}
                  onChange={(e) => setNewSlug(e.target.value)}
                  placeholder="acme-platform"
                />
              </label>

              <label className="form-field">
                <span className="form-label">Description</span>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Shared infrastructure blueprints and production runbooks."
                />
              </label>

              <label className="form-field">
                <span className="form-label">Website (optional)</span>
                <input
                  type="url"
                  value={newWebsite}
                  onChange={(e) => setNewWebsite(e.target.value)}
                  placeholder="https://example.com"
                />
              </label>

              <div className="drawer-form-actions">
                <button type="button" className="action-btn" onClick={() => setView('list')}>
                  Cancel
                </button>
                <button type="submit" className="action-btn primary" disabled={creating}>
                  {creating ? 'Creating…' : 'Create Company'}
                </button>
              </div>
            </form>
          )}

          {view === 'manage' && selectedCompany && (
            <div className="manage-company">
              {!canManageCompany(selectedCompany.myRole) ? (
                <div className="drawer-readonly-note">
                  <div className="drawer-section-title">
                    Role: <span className="tabular">{selectedCompany.myRole.toUpperCase()}</span>
                  </div>
                  <p>
                    {selectedCompany.myRole === 'editor'
                      ? 'As an Editor, you can create and modify architectures in this company. Only company owners and admins can view full member rosters or change company settings.'
                      : 'As a Viewer, you have read-only access to company architectures. Only company owners and admins can edit settings or manage members.'}
                  </p>
                </div>
              ) : loadingDetail ? (
                <div className="drawer-muted tabular">Loading company details…</div>
              ) : detail ? (
                <>
                  <form className="drawer-form" onSubmit={(e) => void handleUpdateCompany(e)}>
                    <div className="drawer-section-title">Company Profile</div>
                    <label className="form-field">
                      <span className="form-label">Name</span>
                      <input
                        type="text"
                        required
                        minLength={2}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="form-label">Slug</span>
                      <input
                        type="text"
                        required
                        value={editSlug}
                        onChange={(e) => setEditSlug(e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="form-label">Description</span>
                      <textarea
                        rows={2}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                      />
                    </label>
                    <label className="form-field">
                      <span className="form-label">Website</span>
                      <input
                        type="url"
                        value={editWebsite}
                        onChange={(e) => setEditWebsite(e.target.value)}
                        placeholder="https://..."
                      />
                    </label>
                    <div className="drawer-form-actions">
                      <button type="submit" className="action-btn primary" disabled={savingEdit}>
                        {savingEdit ? 'Saving…' : 'Save Profile'}
                      </button>
                    </div>
                  </form>

                  <div className="drawer-divider" />

                  <section className="members-section">
                    <div className="drawer-section-title">
                      Members ({detail.members.length})
                    </div>
                    <form className="invite-row" onSubmit={(e) => void handleAddMember(e)}>
                      <input
                        type="email"
                        required
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="colleague@company.com"
                      />
                      <select
                        value={inviteRole}
                        onChange={(e) => setInviteRole(e.target.value as CompanyRole)}
                        aria-label="Member role"
                      >
                        {COMPANY_ROLES.filter(
                          (r) => r !== 'owner' || detail.myRole === 'owner',
                        ).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="action-btn" disabled={inviting}>
                        {inviting ? 'Adding…' : 'Add'}
                      </button>
                    </form>

                    <ul className="member-list">
                      {detail.members.map((m) => {
                        const isOwnerTarget = m.role === 'owner';
                        const ownerCount = detail.members.filter((x) => x.role === 'owner').length;
                        const isLastOwner = isOwnerTarget && ownerCount <= 1;
                        const cannotTouchOwner = isOwnerTarget && detail.myRole !== 'owner';
                        return (
                          <li key={m.userId} className="member-row">
                            <div className="member-info">
                              <div className="member-name">
                                {m.name}
                                {m.userId === user.id && (
                                  <span className="member-you tabular">YOU</span>
                                )}
                              </div>
                              <div className="member-email tabular">{m.email}</div>
                            </div>
                            <div className="member-controls">
                              <select
                                value={m.role}
                                disabled={isLastOwner || cannotTouchOwner}
                                onChange={(e) =>
                                  void handleRoleChange(m.userId, e.target.value as CompanyRole)
                                }
                                title={
                                  isLastOwner
                                    ? 'The last owner cannot be demoted'
                                    : cannotTouchOwner
                                      ? 'Only an owner can modify another owner'
                                      : 'Change member role'
                                }
                              >
                                {COMPANY_ROLES.filter(
                                  (r) => r !== 'owner' || detail.myRole === 'owner' || m.role === 'owner',
                                ).map((r) => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                className="insp-x"
                                disabled={isLastOwner || cannotTouchOwner}
                                onClick={() => void handleRemoveMember(m.userId)}
                                title={
                                  isLastOwner
                                    ? 'Cannot remove the last owner'
                                    : 'Remove member'
                                }
                              >
                                ×
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  {canDeleteCompany(detail.myRole) && (
                    <>
                      <div className="drawer-divider" />
                      <section className="danger-section">
                        <div className="drawer-section-title danger">Danger Zone</div>
                        {!confirmDelete ? (
                          <button
                            type="button"
                            className="insp-delete"
                            onClick={() => setConfirmDelete(true)}
                          >
                            Delete Company
                          </button>
                        ) : (
                          <div className="confirm-delete-row">
                            <span className="confirm-delete-text">
                              Deletes all company architectures and memberships.
                            </span>
                            <button
                              type="button"
                              className="action-btn"
                              onClick={() => setConfirmDelete(false)}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="action-btn danger-solid"
                              disabled={deleting}
                              onClick={() => void handleDeleteCompany()}
                            >
                              {deleting ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                          </div>
                        )}
                      </section>
                    </>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
