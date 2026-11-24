import type { NodeProps, Node } from '@xyflow/react';
import type { GroupNodeData } from '../layout/elk';
import { useAtlasStore } from '../store/useAtlasStore';

export function GroupNodeView({ data }: NodeProps<Node<GroupNodeData, 'zone'>>) {
  const { group } = data;
  const selected = useAtlasStore((s) => s.selectedId === group.id);
  const zone = group.meta?.zone;
  const cidr = group.meta?.cidr;

  return (
    <div className={`group-node kind-${group.kind}${selected ? ' selected' : ''}`}>
      <div className="group-node-blueprint-tag">
        <span className="blueprint-kind tabular">[{group.kind.toUpperCase()}]</span>
        <span className="blueprint-name">{group.label}</span>
        {cidr && <span className="blueprint-cidr tabular">{cidr}</span>}
        {zone && <span className="blueprint-zone">{zone.toUpperCase()}</span>}
      </div>
    </div>
  );
}
