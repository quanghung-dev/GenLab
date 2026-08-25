'use client';

import Link from 'next/link';
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type IsValidConnection,
  type Node,
} from '@xyflow/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlignHorizontalSpaceAround,
  ArrowLeft,
  Check,
  ChevronRight,
  Cloud,
  Play,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import type {
  ExecutionEvent,
  ProviderDescriptor,
  WorkflowValidationResult,
} from '@genflow/workflow-types';
import { areDataTypesCompatible } from '@genflow/workflow-types';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, LoadingBlock } from '@/components/ui';
import {
  apiRequest,
  subscribeToExecution,
  type WorkflowDto,
} from '@/lib/api';
import { useEditorStore, type NodeDefinitionDto } from '@/stores/editor-store';
import { ExecutionPanel } from './execution-panel';
import { GenFlowNode, type CanvasNodeData } from './genflow-node';
import { NodeInspector } from './node-inspector';
import { NodeLibrary } from './node-library';

interface SaveVersionResponse {
  readonly version: { readonly id: string; readonly version: number };
  readonly validation: WorkflowValidationResult;
}

interface ExecutionResponse {
  readonly executionId: string;
  readonly workflowVersionId: string;
  readonly status: string;
}

const nodeTypes = { genflow: GenFlowNode };

function WorkflowCanvas({
  definitions,
  executionByNode,
}: {
  definitions: readonly NodeDefinitionDto[];
  executionByNode: Readonly<Record<string, { status: string; progress?: number }>>;
}) {
  const graph = useEditorStore((state) => state.graph);
  const selectedNodeId = useEditorStore((state) => state.selectedNodeId);
  const applyNodeChanges = useEditorStore((state) => state.applyNodeChanges);
  const applyEdgeChanges = useEditorStore((state) => state.applyEdgeChanges);
  const connect = useEditorStore((state) => state.connect);
  const addNode = useEditorStore((state) => state.addNode);
  const { screenToFlowPosition } = useReactFlow();
  const definitionMap = useMemo(() => new Map(definitions.map((definition) => [definition.type, definition])), [definitions]);
  const nodes = useMemo<Node<CanvasNodeData>[]>(
    () =>
      graph.nodes.flatMap((node) => {
        const definition = definitionMap.get(node.type);
        if (!definition) return [];
        return [
          {
            id: node.id,
            type: 'genflow',
            position: node.position,
            selected: node.id === selectedNodeId,
            data: {
              label: node.name ?? definition.label,
              definition,
              ...(executionByNode[node.id] ? { execution: executionByNode[node.id] } : {}),
            },
          },
        ];
      }),
    [definitionMap, executionByNode, graph.nodes, selectedNodeId],
  );
  const edges = useMemo<Edge[]>(
    () =>
      graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourcePort,
        target: edge.target,
        targetHandle: edge.targetPort,
        type: 'smoothstep',
        animated: Boolean(executionByNode[edge.source]?.status === 'RUNNING'),
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      })),
    [executionByNode, graph.edges],
  );

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false;
      if (connection.source === connection.target) return false;
      const sourceNode = graph.nodes.find((node) => node.id === connection.source);
      const targetNode = graph.nodes.find((node) => node.id === connection.target);
      const sourcePort = definitionMap.get(sourceNode?.type ?? '')?.outputs.find((port) => port.id === connection.sourceHandle);
      const targetPort = definitionMap.get(targetNode?.type ?? '')?.inputs.find((port) => port.id === connection.targetHandle);
      if (!sourcePort || !targetPort) return false;
      if (!areDataTypesCompatible(sourcePort.dataType as never, targetPort.dataType as never)) return false;
      if (!targetPort.multiple && graph.edges.some((edge) => edge.target === connection.target && edge.targetPort === connection.targetHandle)) return false;
      return !graph.edges.some((edge) => edge.source === connection.source && edge.sourcePort === connection.sourceHandle && edge.target === connection.target && edge.targetPort === connection.targetHandle);
    },
    [definitionMap, graph.edges, graph.nodes],
  );

  function onDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    const type = event.dataTransfer.getData('application/genflow-node');
    const definition = definitionMap.get(type);
    if (!definition) return;
    addNode(definition, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
  }

  return (
    <div className="workflow-canvas" onDrop={onDrop} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={applyNodeChanges}
        onEdgesChange={applyEdgeChanges}
        onConnect={connect}
        isValidConnection={isValidConnection}
        fitView
        minZoom={0.18}
        maxZoom={2.2}
        snapToGrid
        snapGrid={[16, 16]}
        deleteKeyCode={['Backspace', 'Delete']}
        multiSelectionKeyCode={['Meta', 'Control']}
        selectionOnDrag
        panOnScroll
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.15} color="rgba(155, 140, 255, .18)" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(node) => (node.data as CanvasNodeData).definition.ui.accent} maskColor="rgba(5, 7, 14, .72)" />
      </ReactFlow>
    </div>
  );
}

export function WorkflowEditor({ projectId, workflowId }: { projectId: string; workflowId: string }) {
  const workflow = useQuery({ queryKey: ['workflow', workflowId], queryFn: () => apiRequest<WorkflowDto>(`/workflows/${workflowId}`) });
  const definitions = useQuery({ queryKey: ['node-definitions'], queryFn: () => apiRequest<readonly NodeDefinitionDto[]>('/node-definitions') });
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => apiRequest<readonly ProviderDescriptor[]>('/providers') });
  const graph = useEditorStore((state) => state.graph);
  const dirty = useEditorStore((state) => state.dirty);
  const currentVersion = useEditorStore((state) => state.currentVersion);
  const loadGraph = useEditorStore((state) => state.loadGraph);
  const markSaved = useEditorStore((state) => state.markSaved);
  const setName = useEditorStore((state) => state.setName);
  const addNode = useEditorStore((state) => state.addNode);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const autoLayout = useEditorStore((state) => state.autoLayout);
  const duplicate = useEditorStore((state) => state.duplicateSelected);
  const remove = useEditorStore((state) => state.deleteSelected);
  const loadedRef = useRef<string | null>(null);
  const streamRef = useRef<AbortController | null>(null);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [validation, setValidation] = useState<WorkflowValidationResult | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [executionStatus, setExecutionStatus] = useState('IDLE');
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [executionByNode, setExecutionByNode] = useState<Record<string, { status: string; progress?: number }>>({});
  const [consoleOpen, setConsoleOpen] = useState(false);

  useEffect(() => {
    if (!workflow.data || loadedRef.current === workflow.data.workflowVersionId) return;
    loadedRef.current = workflow.data.workflowVersionId;
    loadGraph(workflow.data.graph, workflow.data.currentVersion);
    setActiveVersionId(workflow.data.workflowVersionId);
  }, [loadGraph, workflow.data]);

  const save = useMutation({
    mutationFn: async () => {
      const response = await apiRequest<SaveVersionResponse>(`/workflows/${workflowId}/versions`, {
        method: 'POST',
        body: JSON.stringify({ graph, expectedVersion: currentVersion, changeSummary: 'Saved from visual editor' }),
      });
      return response;
    },
    onSuccess: (response) => {
      markSaved(response.version.version);
      setActiveVersionId(response.version.id);
      setValidation(response.validation);
      setOperationError(null);
    },
    onError: (error) => setOperationError(error instanceof Error ? error.message : 'Workflow could not be saved.'),
  });
  const validate = useMutation({
    mutationFn: () => apiRequest<WorkflowValidationResult>(`/workflows/${workflowId}/validate`, { method: 'POST', body: JSON.stringify({ graph }) }),
    onSuccess: (result) => { setValidation(result); setOperationError(null); },
    onError: (error) => setOperationError(error instanceof Error ? error.message : 'Workflow validation failed.'),
  });

  const applyEvent = useCallback((event: ExecutionEvent) => {
    setEvents((current) => [...current, event].slice(-500));
    const nodeId = typeof event.payload.nodeId === 'string' ? event.payload.nodeId : undefined;
    if (nodeId) {
      const nextStatus = event.type === 'node.started' ? 'RUNNING' : event.type === 'node.completed' ? 'SUCCESS' : event.type === 'node.failed' ? 'FAILED' : undefined;
      setExecutionByNode((current) => ({
        ...current,
        [nodeId]: {
          status: nextStatus ?? current[nodeId]?.status ?? 'QUEUED',
          ...(typeof event.payload.progress === 'number' ? { progress: event.payload.progress } : current[nodeId]?.progress !== undefined ? { progress: current[nodeId].progress } : {}),
        },
      }));
    }
    if (event.type === 'execution.started') setExecutionStatus('RUNNING');
    if (event.type === 'execution.completed') { setExecutionStatus('SUCCESS'); streamRef.current?.abort(); }
    if (event.type === 'execution.failed') { setExecutionStatus('FAILED'); streamRef.current?.abort(); }
    if (event.type === 'execution.cancelled') { setExecutionStatus('CANCELLED'); streamRef.current?.abort(); }
  }, []);

  const startStream = useCallback((id: string) => {
    streamRef.current?.abort();
    const controller = new AbortController();
    streamRef.current = controller;
    void subscribeToExecution(id, applyEvent, controller.signal).catch((error) => {
      if (!controller.signal.aborted) setOperationError(error instanceof Error ? error.message : 'Execution stream disconnected.');
    });
  }, [applyEvent]);

  async function runWorkflow(): Promise<void> {
    setOperationError(null);
    let versionId = activeVersionId;
    if (dirty) {
      try {
        const saved = await save.mutateAsync();
        versionId = saved.version.id;
      } catch {
        return;
      }
    }
    if (!versionId) return;
    try {
      const created = await apiRequest<ExecutionResponse>(`/workflows/${workflowId}/executions`, {
        method: 'POST',
        body: JSON.stringify({ workflowVersionId: versionId, inputOverrides: {} }),
      });
      setExecutionId(created.executionId);
      setExecutionStatus(created.status);
      setEvents([]);
      setExecutionByNode({});
      setConsoleOpen(true);
      startStream(created.executionId);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Execution could not start.');
    }
  }

  async function cancelExecution(): Promise<void> {
    if (!executionId) return;
    await apiRequest(`/executions/${executionId}/cancel`, { method: 'POST' });
    setExecutionStatus('CANCELLED');
  }

  async function retryExecution(): Promise<void> {
    if (!executionId) return;
    const response = await apiRequest<{ executionId: string; status: string }>(`/executions/${executionId}/retry`, { method: 'POST' });
    setExecutionStatus(response.status);
    setEvents([]);
    setExecutionByNode({});
    startStream(response.executionId);
  }

  useEffect(() => {
    let copiedNodeId: string | null = null;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === 's') { event.preventDefault(); if (dirty && !save.isPending) save.mutate(); }
      if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (command && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      if (command && event.key.toLowerCase() === 'c') copiedNodeId = useEditorStore.getState().selectedNodeId;
      if (command && event.key.toLowerCase() === 'v' && copiedNodeId) { event.preventDefault(); useEditorStore.getState().selectNode(copiedNodeId); duplicate(); }
      if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicate(); }
      if (event.key === 'Delete' || event.key === 'Backspace') remove();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dirty, duplicate, redo, remove, save, undo]);

  useEffect(() => () => streamRef.current?.abort(), []);

  if (workflow.isPending || definitions.isPending || providers.isPending) return <AppShell compact><LoadingBlock label="Opening workflow editor" /></AppShell>;
  if (!workflow.data || !definitions.data || !providers.data) return <AppShell><div className="fatal-state">Workflow could not be loaded.</div></AppShell>;

  return (
    <AppShell compact>
      <div className="editor-shell">
        <header className="editor-header">
          <div className="editor-breadcrumb"><Link href={`/projects/${projectId}`} title="Back to project"><ArrowLeft size={17} /></Link><span>Projects</span><ChevronRight size={13} /><input value={graph.name} onChange={(event) => setName(event.target.value)} aria-label="Workflow name" /><Badge tone={dirty ? 'warning' : 'success'}>{dirty ? 'Unsaved' : `v${currentVersion}`}</Badge></div>
          <div className="editor-toolbar">
            <button className="icon-button" onClick={undo} title="Undo"><Undo2 size={16} /></button>
            <button className="icon-button" onClick={redo} title="Redo"><Redo2 size={16} /></button>
            <button className="icon-button" onClick={autoLayout} title="Auto layout"><AlignHorizontalSpaceAround size={16} /></button>
            <span className="toolbar-divider" />
            <Button variant="secondary" onClick={() => validate.mutate()} disabled={validate.isPending}><Check size={15} /> Validate</Button>
            <Button variant="secondary" data-action="save" onClick={() => save.mutate()} disabled={!dirty || save.isPending}><Save size={15} /> {save.isPending ? 'Saving…' : 'Save'}</Button>
            <Button onClick={() => void runWorkflow()} disabled={save.isPending || executionStatus === 'RUNNING'}><Play size={15} fill="currentColor" /> Run</Button>
          </div>
        </header>
        {operationError ? <div className="editor-alert error">{operationError}<button onClick={() => setOperationError(null)}>×</button></div> : null}
        {validation && !validation.valid ? <div className="editor-alert warning"><strong>{validation.issues.length} validation issue{validation.issues.length === 1 ? '' : 's'}</strong><span>{validation.issues[0]?.message}</span><button onClick={() => setValidation(null)}>×</button></div> : null}
        {validation?.valid ? <div className="editor-alert success"><Cloud size={15} /><span>Graph is valid and ready to run.</span><button onClick={() => setValidation(null)}>×</button></div> : null}
        <div className="editor-workspace">
          <NodeLibrary definitions={definitions.data} onAdd={(definition) => addNode(definition, { x: 120 + graph.nodes.length * 24, y: 120 + graph.nodes.length * 18 })} />
          <ReactFlowProvider><WorkflowCanvas definitions={definitions.data} executionByNode={executionByNode} /></ReactFlowProvider>
          <NodeInspector definitions={definitions.data} providers={providers.data} />
        </div>
        <ExecutionPanel open={consoleOpen} setOpen={setConsoleOpen} executionId={executionId} status={executionStatus} events={events} onCancel={() => void cancelExecution()} onRetry={() => void retryExecution()} />
      </div>
    </AppShell>
  );
}
