'use client';

import { Copy, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ProviderDescriptor } from '@genflow/workflow-types';
import { Button, Input } from '@/components/ui';
import { useEditorStore, type NodeDefinitionDto } from '@/stores/editor-store';

function NumberField({ label, value, onChange, min, max, step }: { label: string; value: unknown; onChange: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label>{label}<Input type="number" value={typeof value === 'number' ? value : ''} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

export function NodeInspector({ definitions, providers }: { definitions: readonly NodeDefinitionDto[]; providers: readonly ProviderDescriptor[] }) {
  const graph = useEditorStore((state) => state.graph);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const selectNode = useEditorStore((state) => state.selectNode);
  const updateNodeName = useEditorStore((state) => state.updateNodeName);
  const updateConfig = useEditorStore((state) => state.updateNodeConfig);
  const duplicate = useEditorStore((state) => state.duplicateSelected);
  const remove = useEditorStore((state) => state.deleteSelected);
  const [parameterError, setParameterError] = useState<string | null>(null);
  const node = graph.nodes.find((candidate) => candidate.id === selectedNodeId);
  const definition = definitions.find((candidate) => candidate.type === node?.type);
  const provider = providers.find((candidate) => candidate.id === node?.config.providerId);
  const capability = node?.type === 'ai.text.generate' ? 'text.generate' : node?.type === 'ai.image.generate' ? 'image.generate' : node?.type === 'ai.video.generate' ? 'video.generate' : null;
  const models = useMemo(() => provider?.models.filter((model) => !capability || model.capabilities.includes(capability)) ?? [], [provider, capability]);

  if (!node || !definition) {
    return <aside className="node-inspector editor-panel empty-inspector"><SlidersHorizontal size={24} /><h2>Select a node</h2><p>Inspect provider, model, inputs, retry, timeout, and node-specific settings.</p></aside>;
  }
  const config = node.config;
  const set = (patch: Record<string, unknown>) => updateConfig(node.id, patch);
  const aiNode = node.type.startsWith('ai.');

  return (
    <aside className="node-inspector editor-panel">
      <div className="editor-panel-heading"><div><span className="eyebrow">Inspector</span><h2>{definition.label}</h2></div><button className="icon-button" onClick={() => selectNode(null)} title="Close inspector"><X size={16} /></button></div>
      <div className="inspector-scroll">
        <section className="inspector-section"><h3>General</h3><label>Name<Input value={node.name ?? definition.label} onChange={(event) => updateNodeName(node.id, event.target.value)} /></label><p className="field-help">{definition.description}</p></section>
        {node.type === 'input.text' ? <section className="inspector-section"><h3>Value</h3><label>Text<textarea className="textarea" rows={7} value={typeof config.value === 'string' ? config.value : ''} onChange={(event) => set({ value: event.target.value })} /></label></section> : null}
        {aiNode ? (
          <>
            <section className="inspector-section"><h3>Provider</h3><label>Provider<select className="select" value={String(config.providerId ?? '')} onChange={(event) => { const next = providers.find((item) => item.id === event.target.value); const firstModel = next?.models.find((model) => !capability || model.capabilities.includes(capability)); set({ providerId: event.target.value, ...(firstModel ? { model: firstModel.id } : {}) }); }}>{providers.filter((item) => !capability || item.capabilities.includes(capability)).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Model<select className="select" value={String(config.model ?? '')} onChange={(event) => set({ model: event.target.value })}>{models.map((model) => <option value={model.id} key={model.id}>{model.label}</option>)}</select></label><label>Credential reference<Input value={typeof config.credentialId === 'string' ? config.credentialId : ''} onChange={(event) => set({ credentialId: event.target.value || undefined })} placeholder="Optional credential UUID" /></label><p className="field-help">Only the credential reference reaches the browser. Secret values stay server-side.</p></section>
            {node.type === 'ai.text.generate' ? <section className="inspector-section"><h3>Generation</h3><NumberField label="Temperature" value={config.temperature} min={0} max={2} step={0.1} onChange={(value) => set({ temperature: value })} /><NumberField label="Max tokens" value={config.maxTokens} min={1} max={100000} onChange={(value) => set({ maxTokens: value })} /></section> : null}
            {node.type === 'ai.image.generate' ? <section className="inspector-section"><h3>Canvas</h3><div className="field-pair"><NumberField label="Width" value={config.width} min={64} max={8192} onChange={(value) => set({ width: value })} /><NumberField label="Height" value={config.height} min={64} max={8192} onChange={(value) => set({ height: value })} /></div><NumberField label="Seed" value={config.seed} onChange={(value) => set({ seed: value })} /></section> : null}
            {node.type === 'ai.video.generate' ? <section className="inspector-section"><h3>Video</h3><div className="field-pair"><NumberField label="Width" value={config.width} min={64} max={8192} onChange={(value) => set({ width: value })} /><NumberField label="Height" value={config.height} min={64} max={8192} onChange={(value) => set({ height: value })} /></div><NumberField label="Duration (seconds)" value={config.durationSeconds} min={0.1} max={300} step={0.1} onChange={(value) => set({ durationSeconds: value })} /><NumberField label="Seed" value={config.seed} onChange={(value) => set({ seed: value })} /></section> : null}
            {config.providerId === 'comfyui' ? <section className="inspector-section"><h3>ComfyUI workflow</h3><label>parameters.workflow JSON<textarea className="textarea code-textarea" rows={8} defaultValue={JSON.stringify((config.parameters as Record<string, unknown> | undefined)?.workflow ?? {}, null, 2)} onBlur={(event) => { try { const workflow = JSON.parse(event.target.value) as unknown; set({ parameters: { ...((config.parameters as Record<string, unknown>) ?? {}), workflow } }); setParameterError(null); } catch { setParameterError('Workflow must be valid JSON.'); } }} /></label>{parameterError ? <p className="form-error">{parameterError}</p> : null}</section> : null}
            <section className="inspector-section"><h3>Reliability</h3><div className="field-pair"><NumberField label="Retries" value={config.retry} min={0} max={5} onChange={(value) => set({ retry: value })} /><NumberField label="Timeout (ms)" value={config.timeoutMs} min={1000} onChange={(value) => set({ timeoutMs: value })} /></div></section>
          </>
        ) : null}
      </div>
      <footer className="inspector-actions"><Button variant="secondary" onClick={duplicate}><Copy size={15} /> Duplicate</Button><Button variant="danger" onClick={remove}><Trash2 size={15} /> Delete</Button></footer>
    </aside>
  );
}
