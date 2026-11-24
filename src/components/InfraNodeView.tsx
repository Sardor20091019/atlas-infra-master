import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { InfraNodeData } from '../layout/elk';
import { NODE_TYPES } from '../dsl/vocabulary';
import { useAtlasStore } from '../store/useAtlasStore';

export function InfraNodeView({ data }: NodeProps<Node<InfraNodeData, 'infra'>>) {
  const { node } = data;
  const info = NODE_TYPES[node.type];
  const selected = useAtlasStore((s) => s.selectedId === node.id);

  return (
    <div className={`infra-node${selected ? ' selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="handle" />
      <div className="infra-node-glyph" aria-hidden="true">
        {info.glyph}
      </div>
      <div className="infra-node-body">
        <div className="infra-node-label" title={node.label}>
          {node.label}
        </div>
        <div className="infra-node-role" title={node.product ?? info.label}>
          {node.product ?? info.label}
        </div>
      </div>
      {node.replicas && node.replicas > 1 && (
        <span className="infra-node-replicas tabular" title={`${node.replicas} replicas`}>
          ×{node.replicas}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="handle" />
    </div>
  );
}
