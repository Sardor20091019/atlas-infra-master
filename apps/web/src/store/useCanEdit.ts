import {
  isDraftBackedState,
  selectActiveCloud,
  useAtlasStore,
  type AtlasState,
} from './useAtlasStore';

export function evaluateCanEdit(
  s: Pick<
    AtlasState,
    'architectureId' | 'appMode' | 'diagnostics' | 'traceId' | 'user' | 'cloudArchitectures'
  >,
): { canEdit: boolean; reason?: string } {
  const isDraftBacked = isDraftBackedState(s);
  const hasErrors = s.diagnostics.some((d) => d.severity === 'error');
  const tracing = s.traceId !== null;
  const activeCloud = selectActiveCloud(s);

  if (s.appMode !== 'build') {
    return { canEdit: false, reason: 'Switch to Build mode to edit.' };
  }
  if (!isDraftBacked) {
    return {
      canEdit: false,
      reason: 'Gallery entries are read-only. Switch to Build mode to clone and edit.',
    };
  }
  if (activeCloud && !activeCloud.isReference) {
    if (!s.user) {
      return {
        canEdit: false,
        reason: 'Sign in with Google to edit saved cloud architectures, or fork a local copy.',
      };
    }
    if (!activeCloud.permissions.canEdit) {
      return {
        canEdit: false,
        reason: activeCloud.permissions.reason ?? 'You do not have edit permissions here.',
      };
    }
  }
  if (hasErrors) {
    return { canEdit: false, reason: 'Fix the errors in the YAML to edit on the canvas.' };
  }
  if (tracing) {
    return { canEdit: false, reason: 'Stop the trace to edit.' };
  }
  return { canEdit: true };
}

/**
 * Visual editing works on the local scratch draft OR an editable cloud architecture
 * when the user has permission, YAML parses cleanly, and no trace is playing.
 */
export function useCanEdit(): { canEdit: boolean; reason?: string } {
  const architectureId = useAtlasStore((s) => s.architectureId);
  const appMode = useAtlasStore((s) => s.appMode);
  const diagnostics = useAtlasStore((s) => s.diagnostics);
  const traceId = useAtlasStore((s) => s.traceId);
  const user = useAtlasStore((s) => s.user);
  const cloudArchitectures = useAtlasStore((s) => s.cloudArchitectures);

  return evaluateCanEdit({
    architectureId,
    appMode,
    diagnostics,
    traceId,
    user,
    cloudArchitectures,
  });
}
