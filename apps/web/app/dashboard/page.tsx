'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Boxes, FolderKanban, Play, Plus, Sparkles, Workflow } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { Badge, Button, EmptyState, LoadingBlock } from '@/components/ui';
import { apiRequest, type AssetDto, type ProjectDto } from '@/lib/api';
import { formatBytes, formatRelativeDate } from '@/lib/format';
import type { ProviderDescriptor, WorkflowTemplate } from '@genflow/workflow-types';

export default function DashboardPage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => apiRequest<readonly ProjectDto[]>('/projects') });
  const assets = useQuery({ queryKey: ['assets'], queryFn: () => apiRequest<readonly AssetDto[]>('/assets') });
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => apiRequest<readonly ProviderDescriptor[]>('/providers') });
  const templates = useQuery({ queryKey: ['templates'], queryFn: () => apiRequest<readonly WorkflowTemplate[]>('/templates') });
  const loading = projects.isPending || assets.isPending || providers.isPending || templates.isPending;

  return (
    <AppShell>
      <div className="page-container dashboard-page">
        <PageHeader
          eyebrow="Workspace pulse"
          title="Build, run, refine."
          description="A clear view of your workflows, providers, and generated output."
          actions={<Link href="/projects"><Button><Plus size={16} /> New workflow</Button></Link>}
        />
        {loading ? <LoadingBlock label="Loading workspace" /> : (
          <>
            <section className="metric-grid">
              <article className="metric-card"><span className="metric-icon violet"><FolderKanban /></span><div><small>Projects</small><strong>{projects.data?.length ?? 0}</strong></div><span className="metric-caption">active workspace</span></article>
              <article className="metric-card"><span className="metric-icon cyan"><Boxes /></span><div><small>Assets</small><strong>{assets.data?.length ?? 0}</strong></div><span className="metric-caption">{formatBytes(assets.data?.reduce((sum, item) => sum + item.sizeBytes, 0) ?? 0)}</span></article>
              <article className="metric-card"><span className="metric-icon pink"><Sparkles /></span><div><small>Providers</small><strong>{providers.data?.filter((item) => item.enabled).length ?? 0}</strong></div><span className="metric-caption">connected</span></article>
              <article className="metric-card"><span className="metric-icon orange"><Workflow /></span><div><small>Templates</small><strong>{templates.data?.length ?? 0}</strong></div><span className="metric-caption">ready to use</span></article>
            </section>

            <div className="dashboard-grid">
              <section className="surface recent-section">
                <div className="section-heading"><div><span className="eyebrow">Continue working</span><h2>Recent projects</h2></div><Link href="/projects" className="text-link">View all <ArrowUpRight size={14} /></Link></div>
                {projects.data?.length ? (
                  <div className="project-list">
                    {projects.data.slice(0, 5).map((project) => (
                      <Link href={`/projects/${project.id}`} className="project-row" key={project.id}>
                        <span className="project-glyph"><FolderKanban size={19} /></span>
                        <span><strong>{project.name}</strong><small>{project.description || 'No description'}</small></span>
                        <time>{formatRelativeDate(project.updatedAt)}</time>
                        <ArrowUpRight size={16} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<FolderKanban />} title="Your first project starts here" description="Projects keep workflows, executions, and assets scoped together." action={<Link href="/projects"><Button variant="secondary">Create a project</Button></Link>} />
                )}
              </section>

              <aside className="surface provider-panel">
                <div className="section-heading"><div><span className="eyebrow">Runtime</span><h2>Provider status</h2></div></div>
                <div className="provider-list">
                  {providers.data?.map((provider) => (
                    <div className="provider-row" key={provider.id}><span className="provider-logo">{provider.name.slice(0, 1)}</span><span><strong>{provider.name}</strong><small>{provider.capabilities.length} capabilities</small></span><Badge tone={provider.enabled ? 'success' : 'neutral'}>{provider.enabled ? 'Ready' : 'Off'}</Badge></div>
                  ))}
                </div>
                <Link className="panel-link" href="/settings/providers">Manage providers <ArrowUpRight size={15} /></Link>
              </aside>
            </div>

            <section className="templates-section">
              <div className="section-heading"><div><span className="eyebrow">Quick start</span><h2>Start with a clean graph</h2></div></div>
              <div className="template-grid">
                {templates.data?.map((template, index) => (
                  <Link href={projects.data?.[0] ? `/projects/${projects.data[0].id}?template=${template.id}` : '/projects'} className={`template-card template-${index + 1}`} key={template.id}>
                    <span className="template-top"><span className="template-icon"><Play size={17} /></span><Badge>{template.category}</Badge></span>
                    <strong>{template.name}</strong><p>{template.description}</p>
                    <span className="template-flow">{template.graph.nodes.map((node) => <i key={node.id} />)}</span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
