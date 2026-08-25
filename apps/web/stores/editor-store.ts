'use client';

import { create } from 'zustand';
import type { Connection, EdgeChange, NodeChange, XYPosition } from '@xyflow/react';
import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from '@genflow/workflow-types';

export interface NodeDefinitionDto {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  readonly category: 'input' | 'ai' | 'content' | 'processing' | 'logic' | 'utility';
  readonly inputs: readonly { id: string; label: string; dataType: string; required: boolean; multiple: boolean }[];
  readonly outputs: readonly { id: string; label: string; dataType: string; required: boolean; multiple: boolean }[];
  readonly defaultConfig: Readonly<Record<string, unknown>>;
  readonly ui: { readonly icon: string; readonly accent: string; readonly width?: number };
}

interface EditorState {
  graph: WorkflowGraph;
  currentVersion: number;
  dirty: boolean;
  selectedNodeId: string | null;
  past: WorkflowGraph[];
  future: WorkflowGraph[];
  loadGraph: (graph: WorkflowGraph, version: number) => void;
  markSaved: (version: number) => void;
  setName: (name: string) => void;
  selectNode: (nodeId: string | null) => void;
  addNode: (definition: NodeDefinitionDto, position: XYPosition) => void;
  updateNodeName: (nodeId: string, name: string) => void;
  updateNodeConfig: (nodeId: string, patch: Record<string, unknown>) => void;
  applyNodeChanges: (changes: NodeChange[]) => void;
  applyEdgeChanges: (changes: EdgeChange[]) => void;
  connect: (connection: Connection) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  autoLayout: () => void;
  undo: () => void;
  redo: () => void;
}

const emptyGraph: WorkflowGraph = { schemaVersion: 1, name: 'Untitled workflow', nodes: [], edges: [] };

function snapshot(graph: WorkflowGraph): WorkflowGraph {
  return structuredClone(graph);
}

function historyUpdate(state: EditorState, graph: WorkflowGraph) {
  return {
    graph,
    dirty: true,
    past: [...state.past.slice(-49), snapshot(state.graph)],
    future: [],
  };
}

function updateNode(graph: WorkflowGraph, nodeId: string, updater: (node: WorkflowNode) => WorkflowNode): WorkflowGraph {
  return { ...graph, nodes: graph.nodes.map((node) => (node.id === nodeId ? updater(node) : node)) };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  graph: emptyGraph,
  currentVersion: 0,
  dirty: false,
  selectedNodeId: null,
  past: [],
  future: [],
  loadGraph: (graph, version) => set({ graph: snapshot(graph), currentVersion: version, dirty: false, selectedNodeId: null, past: [], future: [] }),
  markSaved: (version) => set({ currentVersion: version, dirty: false }),
  setName: (name) => set((state) => historyUpdate(state, { ...state.graph, name })),
  selectNode: (nodeId) => set({ selectedNodeId: nodeId }),
  addNode: (definition, position) =>
    set((state) => {
      const node: WorkflowNode = {
        id: crypto.randomUUID(),
        type: definition.type,
        name: definition.label,
        position,
        config: structuredClone(definition.defaultConfig),
        disabled: false,
      };
      return { ...historyUpdate(state, { ...state.graph, nodes: [...state.graph.nodes, node] }), selectedNodeId: node.id };
    }),
  updateNodeName: (nodeId, name) =>
    set((state) =>
      historyUpdate(state, updateNode(state.graph, nodeId, (node) => ({ ...node, name }))),
    ),
  updateNodeConfig: (nodeId, patch) =>
    set((state) =>
      historyUpdate(
        state,
        updateNode(state.graph, nodeId, (node) => ({ ...node, config: { ...node.config, ...patch } })),
      ),
    ),
  applyNodeChanges: (changes) =>
    set((state) => {
      let graph = state.graph;
      let selectedNodeId = state.selectedNodeId;
      let structural = false;
      for (const change of changes) {
        if (change.type === 'position' && change.position) {
          graph = updateNode(graph, change.id, (node) => ({ ...node, position: change.position ?? node.position }));
        } else if (change.type === 'remove') {
          structural = true;
          graph = {
            ...graph,
            nodes: graph.nodes.filter((node) => node.id !== change.id),
            edges: graph.edges.filter((edge) => edge.source !== change.id && edge.target !== change.id),
          };
          if (selectedNodeId === change.id) selectedNodeId = null;
        } else if (change.type === 'select' && change.selected) {
          selectedNodeId = change.id;
        }
      }
      return structural
        ? { ...historyUpdate(state, graph), selectedNodeId }
        : { graph, selectedNodeId, dirty: changes.some((change) => change.type === 'position') || state.dirty };
    }),
  applyEdgeChanges: (changes) =>
    set((state) => {
      const removed = new Set(changes.filter((change) => change.type === 'remove').map((change) => change.id));
      if (removed.size === 0) return state;
      return historyUpdate(state, { ...state.graph, edges: state.graph.edges.filter((edge) => !removed.has(edge.id)) });
    }),
  connect: (connection) =>
    set((state) => {
      if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return state;
      const edge: WorkflowEdge = {
        id: crypto.randomUUID(),
        source: connection.source,
        sourcePort: connection.sourceHandle,
        target: connection.target,
        targetPort: connection.targetHandle,
      };
      return historyUpdate(state, { ...state.graph, edges: [...state.graph.edges, edge] });
    }),
  duplicateSelected: () =>
    set((state) => {
      const selected = state.graph.nodes.find((node) => node.id === state.selectedNodeId);
      if (!selected) return state;
      const duplicated: WorkflowNode = {
        ...snapshot({ ...state.graph, nodes: [selected], edges: [] }).nodes[0]!,
        id: crypto.randomUUID(),
        name: `${selected.name ?? selected.type} copy`,
        position: { x: selected.position.x + 36, y: selected.position.y + 36 },
      };
      return { ...historyUpdate(state, { ...state.graph, nodes: [...state.graph.nodes, duplicated] }), selectedNodeId: duplicated.id };
    }),
  deleteSelected: () => {
    const selectedNodeId = get().selectedNodeId;
    if (!selectedNodeId) return;
    get().applyNodeChanges([{ type: 'remove', id: selectedNodeId }]);
  },
  autoLayout: () =>
    set((state) => {
      const indegree = new Map(state.graph.nodes.map((node) => [node.id, 0]));
      const outgoing = new Map(state.graph.nodes.map((node) => [node.id, [] as string[]]));
      for (const edge of state.graph.edges) {
        indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
        outgoing.get(edge.source)?.push(edge.target);
      }
      const depth = new Map<string, number>();
      const queue = state.graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
      for (const id of queue) depth.set(id, 0);
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const source = queue[cursor]!;
        for (const target of outgoing.get(source) ?? []) {
          depth.set(target, Math.max(depth.get(target) ?? 0, (depth.get(source) ?? 0) + 1));
          indegree.set(target, (indegree.get(target) ?? 1) - 1);
          if (indegree.get(target) === 0) queue.push(target);
        }
      }
      const perDepth = new Map<number, number>();
      const nodes = state.graph.nodes.map((node) => {
        const column = depth.get(node.id) ?? 0;
        const row = perDepth.get(column) ?? 0;
        perDepth.set(column, row + 1);
        return { ...node, position: { x: 80 + column * 330, y: 90 + row * 190 } };
      });
      return historyUpdate(state, { ...state.graph, nodes });
    }),
  undo: () =>
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return { graph: previous, past: state.past.slice(0, -1), future: [snapshot(state.graph), ...state.future].slice(0, 50), dirty: true };
    }),
  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return { graph: next, past: [...state.past, snapshot(state.graph)].slice(-50), future: state.future.slice(1), dirty: true };
    }),
}));
