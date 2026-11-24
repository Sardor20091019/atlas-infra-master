import { getArchitecture, type Architecture } from '@atlas/shared';
import {
  isDraftBackedState,
  selectActiveCloud,
  useAtlasStore,
} from './useAtlasStore';

/** The architecture currently on screen: a reference entry, cloud entry, or local draft. */
export function useArchitecture(): Architecture | undefined {
  const id = useAtlasStore((s) => s.architectureId);
  const draft = useAtlasStore((s) => s.draft);
  const cloudArchitectures = useAtlasStore((s) => s.cloudArchitectures);

  if (isDraftBackedState({ architectureId: id, cloudArchitectures })) {
    return draft ?? selectActiveCloud({ architectureId: id, cloudArchitectures })?.dslJson;
  }
  return (
    getArchitecture(id) ??
    cloudArchitectures.find((c) => c.id === id || c.slug === id)?.dslJson
  );
}
