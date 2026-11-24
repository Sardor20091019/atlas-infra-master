import type { Architecture } from '../dsl/types';
import { getArchitecture } from '../architectures';
import { CUSTOM_ID, useAtlasStore } from './useAtlasStore';

/** The architecture currently on screen: a gallery entry or the user's draft. */
export function useArchitecture(): Architecture | undefined {
  const id = useAtlasStore((s) => s.architectureId);
  const draft = useAtlasStore((s) => s.draft);
  return id === CUSTOM_ID ? (draft ?? undefined) : getArchitecture(id);
}
