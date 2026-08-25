import { AppShell, PageHeader } from '@/components/app-shell';
import { ExecutionList } from '@/components/execution-list';

export default function ExecutionsPage() {
  return <AppShell><div className="page-container"><PageHeader eyebrow="Runtime history" title="Executions" description="Inspect immutable, version-bound runs across the workspace." /><ExecutionList /></div></AppShell>;
}
