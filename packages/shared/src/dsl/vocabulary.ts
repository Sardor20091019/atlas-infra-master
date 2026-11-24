import type { GroupKind, LayerId, NodeType } from './types.js';

export interface NodeTypeInfo {
  label: string;
  /** Short emoji glyph until a proper icon set lands. */
  glyph: string;
  color: string;
  /** Generic description of the component class, shown in the card. */
  description: string;
}

export const NODE_TYPES: Record<NodeType, NodeTypeInfo> = {
  user: { label: 'User', glyph: '👤', color: '#64748b', description: 'End user or external client.' },
  dns: { label: 'DNS', glyph: '🌐', color: '#0ea5e9', description: 'Resolves names to IPs; often anycast and geo-aware.' },
  cdn: { label: 'CDN', glyph: '🛰️', color: '#0ea5e9', description: 'Caches static assets close to users and absorbs traffic spikes.' },
  waf: { label: 'WAF', glyph: '🛡️', color: '#f97316', description: 'Web application firewall; filters L7 attacks before they reach the app.' },
  'load-balancer': { label: 'Load balancer', glyph: '⚖️', color: '#8b5cf6', description: 'Distributes traffic across backends; L4 (TCP) or L7 (HTTP).' },
  ingress: { label: 'Ingress', glyph: '🚪', color: '#8b5cf6', description: 'Cluster entry point that routes HTTP(S) to services.' },
  firewall: { label: 'Firewall', glyph: '🧱', color: '#f97316', description: 'Controls which networks can talk to which.' },
  bastion: { label: 'Bastion', glyph: '🔑', color: '#f97316', description: 'Single hardened SSH entry point into private networks.' },
  nat: { label: 'NAT gateway', glyph: '↪️', color: '#0ea5e9', description: 'Lets private subnets reach the internet without being reachable.' },
  'k8s-control-plane': { label: 'K8s control plane', glyph: '🧠', color: '#326ce5', description: 'API server, etcd, scheduler, controllers.' },
  'k8s-node': { label: 'K8s worker node', glyph: '⬢', color: '#326ce5', description: 'Runs pods; grouped into node pools by role.' },
  service: { label: 'Service', glyph: '📦', color: '#22c55e', description: 'Application workload (deployment, statefulset, worker).' },
  vm: { label: 'Virtual machine', glyph: '🖥️', color: '#64748b', description: 'Plain VM running one role.' },
  database: { label: 'Database', glyph: '🗄️', color: '#eab308', description: 'Primary store of record.' },
  'db-proxy': { label: 'DB proxy', glyph: '🔀', color: '#eab308', description: 'Connection pooler / router in front of the database.' },
  cache: { label: 'Cache', glyph: '⚡', color: '#ef4444', description: 'In-memory store for sessions, hot data, rate limits.' },
  queue: { label: 'Queue / stream', glyph: '📨', color: '#ec4899', description: 'Decouples producers from consumers; async work.' },
  'object-storage': { label: 'Object storage', glyph: '🪣', color: '#eab308', description: 'Files, backups, artifacts.' },
  search: { label: 'Search', glyph: '🔍', color: '#14b8a6', description: 'Full-text search and analytics index.' },
  monitoring: { label: 'Monitoring', glyph: '📈', color: '#a3e635', description: 'Metrics, dashboards, alerting.' },
  logging: { label: 'Logging', glyph: '📜', color: '#a3e635', description: 'Centralised logs and traces.' },
  'ci-cd': { label: 'CI/CD', glyph: '🔁', color: '#a78bfa', description: 'Builds, tests, deploys.' },
  registry: { label: 'Registry', glyph: '🏷️', color: '#a78bfa', description: 'Container images and charts.' },
  secrets: { label: 'Secrets', glyph: '🔐', color: '#a78bfa', description: 'Secrets and certificates management.' },
};

/** Layer a freshly added component lands in. Users can change it afterwards. */
export const DEFAULT_NODE_LAYER: Record<NodeType, LayerId> = {
  user: 'physical',
  dns: 'network',
  cdn: 'network',
  waf: 'network',
  'load-balancer': 'network',
  ingress: 'services',
  firewall: 'network',
  bastion: 'network',
  nat: 'network',
  'k8s-control-plane': 'compute',
  'k8s-node': 'compute',
  service: 'services',
  vm: 'compute',
  database: 'data',
  'db-proxy': 'data',
  cache: 'data',
  queue: 'data',
  'object-storage': 'data',
  search: 'data',
  monitoring: 'platform',
  logging: 'platform',
  'ci-cd': 'platform',
  registry: 'platform',
  secrets: 'platform',
};

export const GROUP_KIND_INFO: Record<GroupKind, { label: string; layer: LayerId; glyph: string }> = {
  region: { label: 'Region', layer: 'physical', glyph: '🗺️' },
  datacenter: { label: 'Datacenter', layer: 'physical', glyph: '🏢' },
  vpc: { label: 'VPC', layer: 'network', glyph: '🌐' },
  subnet: { label: 'Subnet', layer: 'network', glyph: '▦' },
  cluster: { label: 'Cluster', layer: 'compute', glyph: '☸️' },
  namespace: { label: 'Namespace', layer: 'services', glyph: '📁' },
  zone: { label: 'Zone / VM', layer: 'compute', glyph: '▢' },
};
