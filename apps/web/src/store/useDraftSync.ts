import { useEffect, useRef } from 'react';
import { parseArchitectureText } from '@atlas/shared';
import { CUSTOM_ID, DRAFT_STORAGE_KEY, useAtlasStore } from './useAtlasStore';
import { loadFromLocationHash } from './draftActions';

const PARSE_DELAY_MS = 250;

/**
 * Keeps the parsed draft in step with the active YAML buffer, persists local
 * scratch drafts to localStorage, and bootstraps cloud auth + architectures.
 */
export function useDraftSync(): void {
  const draftText = useAtlasStore((s) => s.draftText);
  const architectureId = useAtlasStore((s) => s.architectureId);
  const applyParse = useAtlasStore((s) => s.applyParse);
  const bootstrapWorkspace = useAtlasStore((s) => s.bootstrapWorkspace);
  const initial = useRef(true);

  useEffect(() => {
    loadFromLocationHash();
    void bootstrapWorkspace();
  }, [bootstrapWorkspace]);

  useEffect(() => {
    const run = () => {
      const state = useAtlasStore.getState();
      const text = state.draftText;
      applyParse(parseArchitectureText(text));
      if (state.architectureId === CUSTOM_ID) {
        try {
          localStorage.setItem(DRAFT_STORAGE_KEY, text);
        } catch {
          // Storage can be unavailable (private mode); the draft still works for this session.
        }
      }
    };
    // Parse immediately on startup, debounce while typing.
    if (initial.current) {
      initial.current = false;
      run();
      return;
    }
    const t = window.setTimeout(run, PARSE_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [draftText, architectureId, applyParse]);
}
