import { CUSTOM_ID, useAtlasStore } from './useAtlasStore';

/**
 * Visual editing works on the user's draft only, while it parses cleanly
 * (otherwise the canvas shows an older version than the text) and no trace is playing.
 */
export function useCanEdit(): { canEdit: boolean; reason?: string } {
  const isDraft = useAtlasStore((s) => s.architectureId === CUSTOM_ID);
  const appMode = useAtlasStore((s) => s.appMode);
  const hasErrors = useAtlasStore((s) => s.diagnostics.some((d) => d.severity === 'error'));
  const tracing = useAtlasStore((s) => s.traceId !== null);
  if (appMode !== 'build') return { canEdit: false, reason: 'Switch to Build mode to edit.' };
  if (!isDraft) return { canEdit: false, reason: 'Gallery entries are read-only. Switch to Build mode to clone and edit.' };
  if (hasErrors) return { canEdit: false, reason: 'Fix the errors in the YAML to edit on the canvas.' };
  if (tracing) return { canEdit: false, reason: 'Stop the trace to edit.' };
  return { canEdit: true };
}
