'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Plus, Workflow } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { WorkflowTemplate } from '@genflow/workflow-types';
import { AppShell, PageHeader } from '@/components/app-shell';
import { Badge, Button, EmptyState, Input, LoadingBlock } from '@/components/ui';
import { apiRequest, type WorkflowDto } from '@/lib/api';
import { formatRelativeDate } from '@/lib/format';

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const workflows = useQuery({ queryKey: ['workflows', projectId], queryFn: () => apiRequest<readonly WorkflowDto[]>(`/projects/${projectId}/workflows`) });
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => apiRequest<readonly WorkflowTemplate[]>('/templates') });
  useEffect(() => { if (search.get('template')) setCreating(true); }, [search]);
  const createWorkflow = useMutation({
    mutationFn: (input: { name: string; description?: string; templateId?: string }) => apiRequest<WorkflowDto>(`/projects/${projectId}/workflows`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: async (workflow) => { await queryClient.invalidateQueries({ queryKey: ['workflows', projectId] }); window.location.assign(`/projects/${projectId}/workflows/${workflow.id}`); },
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const description = String(data.get('description') ?? '').trim();
    const templateId = String(data.get('templateId') ?? '').trim();
    createWorkflow.mutate({ name: String(data.get('name') ?? '').trim(), ...(description ? { description } : {}), ...(templateId ? { templateId } : {}) });
  }

  return (
    <AppShell>
      <div className="page-container">
        <PageHeader eyebrow="Project workspace" title="Workflows" description="Every save creates an immutable version; every run stays attached to the version it used." actions={<Button onClick={() => setCreating(true)}><Plus size={16} /> New workflow</Button>} />
        {creating ? (
          <form className="surface workflow-create" onSubmit={submit}>
            <div><span className="eyebrow">New workflow</span><h2>Choose a stable starting point</h2></div>
            <div className="form-grid"><label>Name<Input name="name" required autoFocus placeholder="Product launch reel" /></label><label>Description<Input name="description" placeholder="Optional context" /></label></div>
            <div className="template-radio-grid">
              <label className="template-radio"><input type="radio" name="templateId" value="" defaultChecked={!search.get('template')} /><span><strong>Blank graph</strong><small>Start with an empty canvas</small></span></label>
              {templates.data?.map((template) => <label className="template-radio" key={template.id}><input type="radio" name="templateId" value={template.id} defaultChecked={search.get('template') === template.id} /><span><strong>{template.name}</strong><small>{template.description}</small></span></label>)}
            </div>
            {createWorkflow.error ? <p className="form-error">{createWorkflow.error.message}</p> : null}
            <div className="form-actions"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={createWorkflow.isPending}>Create and open</Button></div>
          </form>
        ) : null}
        {workflows.isPending ? <LoadingBlock label="Loading workflows" /> : workflows.data?.length ? (
          <div className="workflow-table surface">
            <div className="table-head"><span>Name</span><span>Version</span><span>Updated</span><span /></div>
            {workflows.data.map((workflow) => (
              <Link href={`/projects/${projectId}/workflows/${workflow.id}`} className="workflow-row" key={workflow.id}>
                <span className="workflow-name"><i><Workflow size={18} /></i><span><strong>{workflow.name}</strong><small>{workflow.graph.nodes.length} nodes · {workflow.graph.edges.length} connections</small></span></span>
                <span><Badge tone="violet">v{workflow.currentVersion}</Badge></span>
                <time>{formatRelativeDate(workflow.updatedAt)}</time><ArrowUpRight size={16} />
              </Link>
            ))}
          </div>
        ) : <EmptyState icon={<Workflow />} title="No workflows in this project" description="Start blank or use a template. The resulting graph is fully editable." action={<Button onClick={() => setCreating(true)}>Create workflow</Button>} />}
      </div>
    </AppShell>
  );
}
