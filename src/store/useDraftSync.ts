import { useEffect, useRef } from 'react';
import { parseArchitectureText } from '../dsl/parse';
import { DRAFT_STORAGE_KEY, useAtlasStore } from './useAtlasStore';
import { loadFromLocationHash } from './draftActions';

const PARSE_DELAY_MS = 250;

/**
 * Keeps the parsed draft in step with the draft text and persists it.
 * Mounted once in App so the draft is usable even while the editor is closed.
 */
export function useDraftSync(): void {
  const draftText = useAtlasStore((s) => s.draftText);
  const applyParse = useAtlasStore((s) => s.applyParse);
  const initial = useRef(true);

  useEffect(() => {
    loadFromLocationHash();
  }, []);

  useEffect(() => {
    const run = () => {
      // Read from the store, not the closure: a share link may have replaced the text this tick.
      const text = useAtlasStore.getState().draftText;
      applyParse(parseArchitectureText(text));
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, text);
      } catch {
        // Storage can be unavailable (private mode); the draft still works for this session.
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
  }, [draftText, applyParse]);
}
