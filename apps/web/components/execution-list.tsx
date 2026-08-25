'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Clock3, PlayCircle } from 'lucide-react';
import { Badge, EmptyState, LoadingBlock } from '@/components/ui';
import { apiRequest } from '@/lib/api';
import { formatRelativeDate } from '@/lib/format';

interface ExecutionSummary {
  readonly id: string;
  readonly projectId: string;
  readonly workflowId: string;
  readonly workflowName: string;
  readonly workflowVersion: number;
  readonly status: string;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

function duration(item: ExecutionSummary): string {
  if (!item.startedAt) return 'Not started';
  const end = item.finishedAt ? new Date(item.finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, (end - new Date(item.startedAt).getTime()) / 1000);
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export function ExecutionList({ projectId }: { projectId?: string }) {
  const query = useQuery({
    queryKey: ['executions', projectId ?? 'all'],
    queryFn: () => apiRequest<readonly ExecutionSummary[]>(`/executions${projectId ? `?projectId=${projectId}` : ''}`),
    refetchInterval: (state) => state.state.data?.some((item) => ['QUEUED', 'RUNNING'].includes(item.status)) ? 3000 : false,
  });
  if (query.isPending) return <LoadingBlock label="Loading executions" />;
  if (!query.data?.length) return <EmptyState icon={<PlayCircle />} title="No executions yet" description="Run a valid workflow and its durable execution history will appear here." />;
  return <div className="execution-table surface"><div className="table-head execution-head"><span>Workflow</span><span>Status</span><span>Duration</span><span>Created</span></div>{query.data.map((item) => <Link href={`/projects/${item.projectId}/workflows/${item.workflowId}`} className="execution-row" key={item.id}><span><i><PlayCircle size={18} /></i><span><strong>{item.workflowName}</strong><small>v{item.workflowVersion} · {item.id.slice(0, 8)}</small></span></span><Badge tone={item.status === 'SUCCESS' ? 'success' : item.status === 'FAILED' ? 'danger' : item.status === 'RUNNING' ? 'violet' : 'neutral'}>{item.status}</Badge><span className="duration"><Clock3 size={14} /> {duration(item)}</span><time>{formatRelativeDate(item.createdAt)}</time></Link>)}</div>;
}
