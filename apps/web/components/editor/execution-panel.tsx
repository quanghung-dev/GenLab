'use client';

import { ChevronDown, ChevronUp, CircleStop, RotateCcw, TerminalSquare } from 'lucide-react';
import type { ExecutionEvent } from '@genflow/workflow-types';
import { Badge, Button } from '@/components/ui';

export function ExecutionPanel({
  open,
  setOpen,
  executionId,
  status,
  events,
  onCancel,
  onRetry,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
  executionId: string | null;
  status: string;
  events: readonly ExecutionEvent[];
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <section className={`execution-panel ${open ? 'open' : ''}`}>
      <header onClick={() => setOpen(!open)}>
        <span className="execution-title"><TerminalSquare size={16} /><strong>Execution console</strong>{executionId ? <code>{executionId.slice(0, 8)}</code> : null}<Badge tone={status === 'SUCCESS' ? 'success' : status === 'FAILED' ? 'danger' : status === 'RUNNING' ? 'violet' : 'neutral'}>{status}</Badge></span>
        <span className="execution-controls">
          {['QUEUED', 'RUNNING'].includes(status) ? <Button variant="ghost" onClick={(event) => { event.stopPropagation(); onCancel(); }}><CircleStop size={14} /> Cancel</Button> : null}
          {['FAILED', 'CANCELLED'].includes(status) ? <Button variant="ghost" onClick={(event) => { event.stopPropagation(); onRetry(); }}><RotateCcw size={14} /> Retry</Button> : null}
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </span>
      </header>
      {open ? <div className="execution-log" role="log">
        {events.length ? events.map((event) => <div className={`log-line log-${event.type.endsWith('failed') ? 'error' : 'info'}`} key={event.eventId}><time>{new Date(event.occurredAt).toLocaleTimeString()}</time><span>{event.type}</span><p>{typeof event.payload.message === 'string' ? event.payload.message : typeof event.payload.nodeId === 'string' ? `Node ${event.payload.nodeId}` : 'Workflow update'}</p>{typeof event.payload.progress === 'number' ? <em>{event.payload.progress}%</em> : null}</div>) : <div className="log-empty">Run this workflow to stream worker events here.</div>}
      </div> : null}
    </section>
  );
}
