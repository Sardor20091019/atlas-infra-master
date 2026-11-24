/**
 * Atlas Infra DSL v0.
 * Everything is plain data (JSON-compatible) so that YAML files, community
 * contributions and AI output can map onto it 1:1.
 */

export type LayerId = 'physical' | 'network' | 'compute' | 'services' | 'data' | 'platform';

export interface Layer {
  id: LayerId;
  label: string;
  /** Short explanation shown in the layer panel tooltip. */
  description: string;
}

/** Controlled vocabulary. Drives icon and color of a node. */
export type NodeType =
  | 'user'
  | 'dns'
  | 'cdn'
  | 'waf'
  | 'load-balancer'
  | 'ingress'
  | 'firewall'
  | 'bastion'
  | 'nat'
  | 'k8s-control-plane'
  | 'k8s-node'
  | 'service'
  | 'vm'
  | 'database'
  | 'db-proxy'
  | 'cache'
  | 'queue'
  | 'object-storage'
  | 'search'
  | 'monitoring'
  | 'logging'
  | 'ci-cd'
  | 'registry'
  | 'secrets';

export const GROUP_KINDS = ['region', 'datacenter', 'vpc', 'subnet', 'cluster', 'namespace', 'zone'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

/**
 * One step of an architecture's evolution, e.g. "Single server, ~1k users".
 * Items opt into stages with `since` / `until` and change per stage with `at`.
 */
export interface Stage {
  id: string;
  label: string;
  /** Rough load this stage is built for, e.g. "~100k users". */
  scale?: string;
  /** What changed compared to the previous stage, and why. */
  summary: string;
}

/** Visibility across stages. Both ends are inclusive; omitted means "from the start" / "to the end". */
export interface StageScoped {
  since?: string;
  until?: string;
}

export type GroupOverride = Partial<Pick<Group, 'label' | 'parent' | 'meta' | 'why'>>;
export type NodeOverride = Partial<Pick<InfraNode, 'label' | 'product' | 'replicas' | 'why' | 'group' | 'meta'>>;
export type EdgeOverride = Partial<Pick<InfraEdge, 'label' | 'protocol' | 'why' | 'style'>>;

export interface Group extends StageScoped {
  id: string;
  label: string;
  kind: GroupKind;
  layer: LayerId;
  /** Parent group id. Top-level groups have no parent. */
  parent?: string;
  /** Free-form metadata rendered in the card (cidr, zone, az, ...). */
  meta?: Record<string, string>;
  why?: string;
  /** Changes that take effect from the given stage id onwards. */
  at?: Record<string, GroupOverride>;
}

export interface InfraNode extends StageScoped {
  id: string;
  label: string;
  type: NodeType;
  /** Concrete product, e.g. "haproxy", "nginx", "postgresql 16". */
  product?: string;
  layer: LayerId;
  /** Group id this node lives in. */
  group?: string;
  /** Why this component sits here. Mandatory: it is the whole point of the atlas. */
  why: string;
  /** Alternatives that could replace this component. */
  alternatives?: string[];
  meta?: Record<string, string>;
  /** Number of replicas / instances, rendered as a badge. */
  replicas?: number;
  /** Changes that take effect from the given stage id onwards (moves, upgrades, scaling). */
  at?: Record<string, NodeOverride>;
}

export interface InfraEdge extends StageScoped {
  id?: string;
  from: string;
  to: string;
  label?: string;
  /** e.g. "tcp/443", "http/80", "pg/5432" */
  protocol?: string;
  layer: LayerId;
  why?: string;
  /** Dashed edges for async / replication / control traffic. */
  style?: 'solid' | 'dashed';
  at?: Record<string, EdgeOverride>;
}

/** One hop of a request trace. Must match an existing edge (from → to). */
export interface TraceStep {
  from: string;
  to: string;
  /** What happens at this hop, shown while the step is active. */
  note: string;
}

/** A named path through the architecture, e.g. "Page load" or "Background job". */
export interface Trace {
  id: string;
  name: string;
  description?: string;
  steps: TraceStep[];
}

export interface Architecture {
  id: string;
  name: string;
  /** One-paragraph summary shown in the gallery and in the header. */
  description: string;
  /** Rough scale this architecture is designed for. */
  scale?: string;
  tags?: string[];
  layers: LayerId[];
  groups: Group[];
  nodes: InfraNode[];
  edges: InfraEdge[];
  traces?: Trace[];
  /** Optional evolution, smallest first. Without stages, everything is always visible. */
  stages?: Stage[];
}

export const LAYERS: Record<LayerId, Layer> = {
  physical: {
    id: 'physical',
    label: 'Physical',
    description: 'Regions, datacenters, availability zones, bare metal.',
  },
  network: {
    id: 'network',
    label: 'Network',
    description: 'VPCs, subnets, firewalls, NAT, DMZ, load balancers at the edge.',
  },
  compute: {
    id: 'compute',
    label: 'Compute',
    description: 'Kubernetes clusters, node pools, virtual machines.',
  },
  services: {
    id: 'services',
    label: 'Services',
    description: 'Ingress, application services, workers.',
  },
  data: {
    id: 'data',
    label: 'Data',
    description: 'Databases, caches, queues, object storage.',
  },
  platform: {
    id: 'platform',
    label: 'Platform',
    description: 'Observability, CI/CD, registry, secrets.',
  },
};
