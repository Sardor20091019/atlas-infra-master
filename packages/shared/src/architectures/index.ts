import type { Architecture } from '../dsl/types.js';
import { validateArchitecture } from '../dsl/validate.js';
import { simpleWebApp } from './simple-web-app.js';
import { k8sProdCluster } from './k8s-prod-cluster.js';
import { threeTierNetwork } from './three-tier-network.js';
import { webEvolution } from './web-evolution.js';

/** The evolution tour first, then the standalone references from smallest to largest. */
export const referenceArchitectures: Architecture[] = [
  webEvolution,
  simpleWebApp,
  k8sProdCluster,
  threeTierNetwork,
];

/** Alias kept for compatibility with existing frontend gallery code. */
export const architectures = referenceArchitectures;

export function getArchitecture(id: string): Architecture | undefined {
  return referenceArchitectures.find((a) => a.id === id);
}

export function validateReferenceArchitectures(): void {
  for (const arch of referenceArchitectures) {
    const issues = validateArchitecture(arch);
    if (issues.length) {
      const lines = issues.map((i) => `${i.severity} at ${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid architecture ${arch.id}:\n${lines.join('\n')}`);
    }
  }
}

export { simpleWebApp, k8sProdCluster, threeTierNetwork, webEvolution };
