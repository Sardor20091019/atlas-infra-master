import { useMemo } from 'react';
import { resolveStage, type StageView } from '@atlas/shared';
import { useArchitecture } from './useArchitecture';
import { useAtlasStore } from './useAtlasStore';

/** The current architecture as it looks at the selected stage, plus what changed. */
export function useStagedView(): StageView | undefined {
  const arch = useArchitecture();
  const stageIndex = useAtlasStore((s) => s.stageIndex);
  return useMemo(() => (arch ? resolveStage(arch, stageIndex) : undefined), [arch, stageIndex]);
}
