'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Clapperboard, Image, LogOut, Sparkles, Type } from 'lucide-react';
import type { NodeDefinitionDto } from '@/stores/editor-store';

export interface CanvasNodeData extends Record<string, unknown> {
  readonly label: string;
  readonly definition: NodeDefinitionDto;
  readonly execution?: { readonly status: string; readonly progress?: number };
}

const icons = { Type, Sparkles, Image, Clapperboard, LogOut };

export const GenFlowNode = memo(function GenFlowNode({ data, selected }: NodeProps) {
  const nodeData = data as CanvasNodeData;
  const definition = nodeData.definition;
  const Icon = icons[definition.ui.icon as keyof typeof icons] ?? Sparkles;
  return (
    <article className={`flow-node ${selected ? 'selected' : ''} ${nodeData.execution?.status ? `status-${nodeData.execution.status.toLowerCase()}` : ''}`} style={{ '--node-accent': definition.ui.accent } as React.CSSProperties}>
      <header><span className="node-icon"><Icon size={15} /></span><span><strong>{nodeData.label}</strong><small>{definition.category}</small></span><i className="node-status-dot" /></header>
      <div className="node-ports">
        <div className="input-ports">
          {definition.inputs.map((port) => <div className="port-row input-port" key={port.id}><Handle type="target" id={port.id} position={Position.Left} /><span>{port.label}</span><em>{port.dataType}</em></div>)}
        </div>
        <div className="output-ports">
          {definition.outputs.map((port) => <div className="port-row output-port" key={port.id}><em>{port.dataType}</em><span>{port.label}</span><Handle type="source" id={port.id} position={Position.Right} /></div>)}
        </div>
      </div>
      {nodeData.execution ? <footer><span>{nodeData.execution.status}</span>{nodeData.execution.progress !== undefined ? <div className="node-progress"><i style={{ width: `${nodeData.execution.progress}%` }} /></div> : null}</footer> : null}
    </article>
  );
});
