'use client';

import { useParams } from 'next/navigation';
import { AppShell, PageHeader } from '@/components/app-shell';
import { ExecutionList } from '@/components/execution-list';

export default function ProjectExecutionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <AppShell><div className="page-container"><PageHeader eyebrow="Project runtime" title="Executions" description="Version-bound execution history for this project." /><ExecutionList projectId={projectId} /></div></AppShell>;
}
