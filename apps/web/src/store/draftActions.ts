import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { BLANK_TEMPLATE, toYaml, type Architecture } from '@atlas/shared';
import { CUSTOM_ID, useAtlasStore } from './useAtlasStore';

const SHARE_PREFIX = '#a=';

/**
 * Replace the local scratch draft with new text, asking first if that would throw away work.
 * Returns false when the user cancels.
 */
export function replaceDraft(text: string, what: string): boolean {
  const state = useAtlasStore.getState();
  const currentLocal = state.architectureId === CUSTOM_ID ? state.draftText : state.localDraftText;
  const hasWork = currentLocal !== BLANK_TEMPLATE && currentLocal !== text;
  if (hasWork && !window.confirm(`Replace your local scratch draft with ${what}? Your local draft will be lost.`)) {
    return false;
  }
  state.setArchitecture(CUSTOM_ID);
  useAtlasStore.getState().loadDraftText(text);
  useAtlasStore.getState().setEditorOpen(true);
  return true;
}

/** Open any architecture in the editor as the user's own local scratch draft. */
export function editCopy(arch: Architecture): boolean {
  const copy = { ...arch, id: `${arch.id}-copy`, name: `${arch.name} (my copy)` };
  return replaceDraft(toYaml(copy), `a copy of "${arch.name}"`);
}

export function shareUrl(text: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}${SHARE_PREFIX}${compressToEncodedURIComponent(text)}`;
}

export function cloudShareUrl(slug: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}?arch=${encodeURIComponent(slug)}`;
}

/** Load a draft from a share link in the URL hash, then clean the URL. */
export function loadFromLocationHash(): void {
  const { hash, pathname, search } = window.location;
  if (!hash.startsWith(SHARE_PREFIX)) return;
  window.history.replaceState(null, '', pathname + search);
  const text = decompressFromEncodedURIComponent(hash.slice(SHARE_PREFIX.length));
  if (text) replaceDraft(text, 'the shared architecture');
}
