'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, FolderKanban, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { Button, EmptyState, Input, LoadingBlock } from '@/components/ui';
import { apiRequest, type ProjectDto } from '@/lib/api';
import { formatRelativeDate } from '@/lib/format';
import { formString } from '@/lib/forms';

export default function ProjectsPage() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => apiRequest<readonly ProjectDto[]>('/projects') });
  const createProject = useMutation({
    mutationFn: (input: { name: string; description?: string }) => apiRequest<ProjectDto>('/projects', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: async () => { setCreating(false); await queryClient.invalidateQueries({ queryKey: ['projects'] }); },
    onError: (value) => setError(value instanceof Error ? value.message : 'Project could not be created.'),
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const description = formString(data, 'description');
    createProject.mutate({ name: formString(data, 'name'), ...(description ? { description } : {}) });
  }

  return (
    <AppShell>
      <div className="page-container">
        <PageHeader eyebrow="Library" title="Projects" description="Keep related workflows, execution history, and assets in one boundary." actions={<Button onClick={() => setCreating(true)}><Plus size={16} /> New project</Button>} />
        {creating ? (
          <form className="surface inline-create" onSubmit={submit}>
            <div><span className="eyebrow">New project</span><h2>Name the workspace boundary</h2></div>
            <label>Project name<Input name="name" required autoFocus placeholder="Campaign Studio" /></label>
            <label>Description<Input name="description" placeholder="Short-form video production" /></label>
            {error ? <p className="form-error">{error}</p> : null}
            <div className="form-actions"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button type="submit" disabled={createProject.isPending}>Create project</Button></div>
          </form>
        ) : null}
        {projects.isPending ? <LoadingBlock label="Loading projects" /> : projects.data?.length ? (
          <section className="cards-grid">
            {projects.data.map((project, index) => (
              <Link href={`/projects/${project.id}`} className="project-card" key={project.id}>
                <span className={`project-cover cover-${(index % 4) + 1}`}><FolderKanban size={26} /><i /><i /></span>
                <span className="project-card-copy"><strong>{project.name}</strong><p>{project.description || 'No description yet.'}</p><small>Updated {formatRelativeDate(project.updatedAt)}</small></span>
                <ArrowUpRight size={17} />
              </Link>
            ))}
          </section>
        ) : (
          <EmptyState icon={<FolderKanban />} title="No projects yet" description="Create one project, then add a workflow from a template or a blank graph." action={<Button onClick={() => setCreating(true)}>Create project</Button>} />
        )}
      </div>
    </AppShell>
  );
}
