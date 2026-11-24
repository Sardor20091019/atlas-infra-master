import type { Architecture } from '../dsl/types';
import { validateArchitecture } from '../dsl/validate';
import { simpleWebApp } from './simple-web-app';
import { k8sProdCluster } from './k8s-prod-cluster';
import { threeTierNetwork } from './three-tier-network';
import { webEvolution } from './web-evolution';

/** The evolution tour first, then the standalone references from smallest to largest. */
export const architectures: Architecture[] = [webEvolution, simpleWebApp, k8sProdCluster, threeTierNetwork];

// Gallery entries must be clean: in development, warnings fail as hard as errors.
if (import.meta.env.DEV) {
  for (const arch of architectures) {
    const issues = validateArchitecture(arch);
    if (issues.length) {
      const lines = issues.map((i) => `${i.severity} at ${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid architecture ${arch.id}:\n${lines.join('\n')}`);
    }
  }
}

export function getArchitecture(id: string): Architecture | undefined {
  return architectures.find((a) => a.id === id);
}
