import { Document, isMap, isScalar, isSeq, parseDocument, visit, type Node as YamlNode } from 'yaml';
import type { Architecture, LayerId } from './types';
import { architectureSchema, LAYER_IDS } from './schema';
import { validateArchitecture, type IssuePath } from './validate';

export interface Diagnostic {
  from: number;
  to: number;
  /** 1-based line of `from`, for the issue list. */
  line: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface ParseResult {
  /** Present only when there are no errors (warnings are fine). */
  arch?: Architecture;
  diagnostics: Diagnostic[];
}

/**
 * Full pipeline for user-written text: YAML syntax → schema → semantic checks.
 * Every problem is mapped back to a character range so the editor can underline it.
 * JSON is valid YAML, so JSON documents work too.
 */
export function parseArchitectureText(text: string): ParseResult {
  const doc = parseDocument(text, { prettyErrors: false });
  const diagnostics: Diagnostic[] = [];
  const add = (severity: Diagnostic['severity'], message: string, from: number, to: number) =>
    diagnostics.push({ severity, message, from, to: Math.max(to, from), line: lineOf(text, from) });

  for (const e of doc.errors) add('error', firstLine(e.message), e.pos[0], e.pos[1]);
  for (const w of doc.warnings) add('warning', firstLine(w.message), w.pos[0], w.pos[1]);
  if (doc.errors.length) return { diagnostics };

  const data: unknown = doc.toJS();
  if (data == null) {
    add('error', 'Document is empty. Start with id, name, nodes.', 0, 0);
    return { diagnostics };
  }

  const parsed = architectureSchema.safeParse(data);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.filter((p): p is string | number => typeof p !== 'symbol');
      if (issue.code === 'unrecognized_keys') {
        for (const key of issue.keys) {
          const [from, to] = locateKey(doc, text, path, key);
          add('error', `Unknown key "${key}"`, from, to);
        }
        continue;
      }
      // Check the data itself rather than parsing zod's wording.
      const missing = (issue.code === 'invalid_type' || issue.code === 'invalid_value') && valueAt(data, path) === undefined;
      const message = missing ? `Missing required field "${String(path.at(-1))}"` : issue.message;
      const [from, to] = locate(doc, text, path);
      add('error', message, from, to);
    }
    return { diagnostics: sortDiagnostics(diagnostics) };
  }

  const input = parsed.data;
  const used = new Set<LayerId>([
    ...input.groups.map((g) => g.layer),
    ...input.nodes.map((n) => n.layer),
    ...input.edges.map((e) => e.layer),
  ]);
  const arch: Architecture = { ...input, layers: input.layers ?? LAYER_IDS.filter((l) => used.has(l)) };

  for (const issue of validateArchitecture(arch)) {
    const [from, to] = locate(doc, text, issue.path);
    add(issue.severity, issue.message, from, to);
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return { arch: hasErrors ? undefined : arch, diagnostics: sortDiagnostics(diagnostics) };
}

/** Character range of the item at `path`, falling back to the nearest existing ancestor. */
export function locate(doc: Document, text: string, path: IssuePath): [number, number] {
  for (let len = path.length; len >= 0; len--) {
    const node = (len === 0 ? doc.contents : doc.getIn(path.slice(0, len), true)) as YamlNode | null | undefined;
    if (!node?.range) continue;
    const [start, valueEnd] = node.range;
    // Collections can span hundreds of lines; underline just their first line.
    if (isMap(node) || isSeq(node)) return [start, lineEnd(text, start)];
    if (isScalar(node)) return [start, valueEnd];
    return [start, valueEnd];
  }
  return [0, 0];
}

/** Range of a key inside the map at `path` (used for unknown keys). */
function locateKey(doc: Document, text: string, path: IssuePath, key: string): [number, number] {
  const map = path.length === 0 ? doc.contents : doc.getIn(path, true);
  if (isMap(map)) {
    const pair = map.items.find((p) => isScalar(p.key) && p.key.value === key);
    if (pair && isScalar(pair.key) && pair.key.range) return [pair.key.range[0], pair.key.range[1]];
  }
  return locate(doc, text, path);
}

/** Find the range of a node or group definition by id, for "reveal in editor". */
export function locateItem(text: string, id: string): [number, number] | undefined {
  const doc = parseDocument(text);
  for (const collection of ['nodes', 'groups'] as const) {
    const seq = doc.get(collection, true);
    if (!isSeq(seq)) continue;
    const index = seq.items.findIndex((item) => isMap(item) && item.get('id') === id);
    if (index >= 0) return locate(doc, text, [collection, index]);
  }
  return undefined;
}

/** Re-print YAML with consistent indentation while keeping comments. */
export function formatYaml(text: string): string | undefined {
  const doc = parseDocument(text);
  if (doc.errors.length) return undefined;
  return doc.toString({ lineWidth: 0 });
}

/** Serialise an architecture to the YAML users edit. */
export function toYaml(arch: Architecture): string {
  // JSON round-trip drops undefined fields so they do not print as "null".
  const doc = new Document(JSON.parse(JSON.stringify(arch)));
  // Short scalar lists (layers, tags, alternatives) read better inline.
  visit(doc, {
    Seq(_, seq) {
      if (seq.items.length > 0 && seq.items.every((i) => isScalar(i))) seq.flow = true;
    },
  });
  doc.commentBefore = ` Atlas Infra architecture (DSL v0). Edit freely: the diagram updates as you type.`;
  return doc.toString({ lineWidth: 0 });
}

function valueAt(data: unknown, path: IssuePath): unknown {
  let cur: unknown = data;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur;
}

function sortDiagnostics(d: Diagnostic[]): Diagnostic[] {
  return d.sort((a, b) => a.from - b.from);
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function lineEnd(text: string, offset: number): number {
  const nl = text.indexOf('\n', offset);
  return nl === -1 ? text.length : nl;
}

function firstLine(message: string): string {
  return message.split('\n')[0];
}

export const BLANK_TEMPLATE = `# Atlas Infra architecture (DSL v0)
# The diagram on the left updates as you type.
#
# groups  boxes that contain things: region, datacenter, vpc, subnet, cluster, namespace, zone
# nodes   components; every node needs id, label, type, layer, and a "why"
# edges   connections between nodes (from, to, layer); style: dashed for async or secondary traffic
# traces  optional step-by-step request paths that follow edges
# stages  optional evolution: add since / until / at to items (see "Scaling a web app" in the gallery)
#
# Press Ctrl+Space after "type:", "layer:", "kind:", "group:", "from:" or "to:" for suggestions.

id: my-architecture
name: My architecture
description: A web app behind a load balancer with a database in a private subnet.
layers: [ network, services, data ]

groups:
  - id: vpc
    label: VPC 10.0.0.0/16
    kind: vpc
    layer: network
    meta: { cidr: 10.0.0.0/16 }
  - id: public
    label: public 10.0.1.0/24
    kind: subnet
    layer: network
    parent: vpc
    meta: { zone: public }
  - id: private
    label: private 10.0.10.0/24
    kind: subnet
    layer: network
    parent: vpc
    meta: { zone: private }

nodes:
  - id: user
    label: Users
    type: user
    layer: network
    why: Browsers and mobile apps.
  - id: lb
    label: Load balancer
    type: load-balancer
    product: nginx
    layer: network
    group: public
    why: Terminates TLS and spreads traffic across app instances.
  - id: app
    label: App
    type: service
    layer: services
    group: private
    replicas: 2
    why: Stateless application servers.
  - id: db
    label: PostgreSQL
    type: database
    layer: data
    group: private
    why: Primary store of record.

edges:
  - { from: user, to: lb, protocol: tcp/443, layer: network }
  - { from: lb, to: app, protocol: http/8080, layer: services }
  - { from: app, to: db, protocol: pg/5432, layer: data }

traces:
  - id: request
    name: Request
    steps:
      - { from: user, to: lb, note: The browser connects to the load balancer over HTTPS. }
      - { from: lb, to: app, note: TLS ends at the load balancer; plain HTTP goes to an app instance. }
      - { from: app, to: db, note: The app queries the database over the private network. }
`;
