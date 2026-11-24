import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAtlasStore } from '../store/useAtlasStore';

interface AccountMenuProps {
  onOpenCompanies: () => void;
  onOpenSaveModal: () => void;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function AccountMenu({ onOpenCompanies, onOpenSaveModal }: AccountMenuProps) {
  const user = useAtlasStore((s) => s.user);
  const authLoaded = useAtlasStore((s) => s.authLoaded);
  const apiAvailable = useAtlasStore((s) => s.apiAvailable);
  const companies = useAtlasStore((s) => s.companies);
  const logout = useAtlasStore((s) => s.logout);
  const setNotice = useAtlasStore((s) => s.setNotice);

  const [open, setOpen] = useState(false);
  const [checkingApi, setCheckingApi] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onOutside);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onOutside);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) {
    const handleSignInClick = async () => {
      if (checkingApi) return;
      if (apiAvailable || !authLoaded) {
        window.location.assign(api.auth.getGoogleLoginUrl());
        return;
      }

      setCheckingApi(true);
      try {
        const res = await fetch('/api/health', { credentials: 'include' });
        if (res.ok) {
          window.location.assign(api.auth.getGoogleLoginUrl());
          return;
        }
      } catch {
        // Fall through to helpful notice.
      } finally {
        setCheckingApi(false);
      }

      setNotice('API server is offline. Start both services with "pnpm dev" and try again.');
    };

    return (
      <button
        type="button"
        className={`action-btn account-signin-btn${!apiAvailable && authLoaded ? ' offline' : ''}`}
        disabled={checkingApi}
        title={
          !apiAvailable && authLoaded
            ? 'API server offline — click to retry or start pnpm dev'
            : 'Sign in with Google'
        }
        onClick={() => void handleSignInClick()}
      >
        <svg className="google-g-icon" viewBox="0 0 18 18" width="13" height="13" aria-hidden="true">
          <path
            fill="currentColor"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z"
          />
          <path
            fill="currentColor"
            opacity="0.82"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.33-1.58-5.04-3.71H.95v2.33A9 9 0 0 0 9 18z"
          />
          <path
            fill="currentColor"
            opacity="0.65"
            d="M3.96 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.95A9 9 0 0 0 0 9c0 1.45.35 2.82.95 4.04l3.01-2.33z"
          />
          <path
            fill="currentColor"
            opacity="0.9"
            d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.96l3.01 2.33C4.67 5.16 6.66 3.58 9 3.58z"
          />
        </svg>
        <span>{checkingApi ? 'Checking…' : 'Sign in'}</span>
      </button>
    );
  }

  const activeCompany = user.activeCompanyId
    ? companies.find((c) => c.id === user.activeCompanyId)
    : undefined;

  return (
    <div className="account-menu" ref={containerRef}>
      <button
        type="button"
        className={`action-btn account-trigger${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={`${user.name} (${user.email})`}
      >
        {user.avatarUrl ? (
          <img className="account-avatar" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className="account-initials tabular">{initialsOf(user.name)}</span>
        )}
        <span className="account-name">{user.name.split(' ')[0]}</span>
        <span className="arch-switcher-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="account-dropdown" role="menu" aria-label="Account Menu">
          <div className="account-dropdown-head">
            <div className="account-dropdown-name">{user.name}</div>
            <div className="account-dropdown-email tabular">{user.email}</div>
            <div className="account-dropdown-scope">
              <span className="scope-label">WORKSPACE</span>
              <span className="scope-value tabular">
                {activeCompany ? `${activeCompany.name} (${activeCompany.myRole})` : 'Personal'}
              </span>
            </div>
          </div>

          <div className="account-dropdown-actions">
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenCompanies();
              }}
            >
              <span>Companies &amp; Members</span>
              <span className="dropdown-meta tabular">{companies.length}</span>
            </button>
            <button
              type="button"
              className="dropdown-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onOpenSaveModal();
              }}
            >
              <span>Save / Publish Draft</span>
            </button>
          </div>

          <div className="account-dropdown-foot">
            <button
              type="button"
              className="dropdown-item danger"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                void logout();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
