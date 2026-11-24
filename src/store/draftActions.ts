import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import type { Architecture } from '../dsl/types';
import { BLANK_TEMPLATE, toYaml } from '../dsl/parse';
import { CUSTOM_ID, useAtlasStore } from './useAtlasStore';

const SHARE_PREFIX = '#a=';

/**
 * Replace the draft with new text, asking first if that would throw away work.
 * Returns false when the user cancels.
 */
export function replaceDraft(text: string, what: string): boolean {
  const { draftText, loadDraftText, setArchitecture, setEditorOpen } = useAtlasStore.getState();
  const hasWork = draftText !== BLANK_TEMPLATE && draftText !== text;
  if (hasWork && !window.confirm(`Replace your current draft with ${what}? Your draft will be lost.`)) return false;
  loadDraftText(text);
  setArchitecture(CUSTOM_ID);
  setEditorOpen(true);
  return true;
}

/** Open a gallery architecture in the editor as the user's own draft. */
export function editCopy(arch: Architecture): boolean {
  const copy = { ...arch, id: `${arch.id}-copy`, name: `${arch.name} (my copy)` };
  return replaceDraft(toYaml(copy), `a copy of "${arch.name}"`);
}

export function shareUrl(text: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${SHARE_PREFIX}${compressToEncodedURIComponent(text)}`;
}

/** Load a draft from a share link in the URL hash, then clean the URL. */
export function loadFromLocationHash(): void {
  const { hash, pathname, search } = window.location;
  if (!hash.startsWith(SHARE_PREFIX)) return;
  window.history.replaceState(null, '', pathname + search);
  const text = decompressFromEncodedURIComponent(hash.slice(SHARE_PREFIX.length));
  if (text) replaceDraft(text, 'the shared architecture');
}
