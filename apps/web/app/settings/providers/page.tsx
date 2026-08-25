'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Cable, CheckCircle2, ServerCog, ShieldCheck, TestTube2 } from 'lucide-react';
import type { ProviderDescriptor } from '@genflow/workflow-types';
import { AppShell, PageHeader } from '@/components/app-shell';
import { Badge, Button, LoadingBlock } from '@/components/ui';
import { apiRequest } from '@/lib/api';

export default function ProvidersPage() {
  const providers = useQuery({ queryKey: ['providers'], queryFn: () => apiRequest<readonly ProviderDescriptor[]>('/providers') });
  const test = useMutation({ mutationFn: (providerId: string) => apiRequest<{ ok: boolean; capabilities: string[] }>(`/providers/${providerId}/test`, { method: 'POST' }) });
  return <AppShell><div className="page-container"><PageHeader eyebrow="Runtime configuration" title="AI providers" description="Provider and model lists come from the backend registry; workflows keep only stable references." />{providers.isPending ? <LoadingBlock label="Loading providers" /> : <div className="settings-layout"><section className="provider-settings-list">{providers.data?.map((provider) => <article className="surface provider-settings-card" key={provider.id}><div className="provider-settings-icon"><ServerCog /></div><div className="provider-settings-copy"><span><h2>{provider.name}</h2><Badge tone={provider.enabled ? 'success' : 'neutral'}>{provider.enabled ? 'Enabled' : 'Disabled'}</Badge></span><p>{provider.models.length} model{provider.models.length === 1 ? '' : 's'} · {provider.capabilities.join(', ')}</p><div className="model-chips">{provider.models.map((model) => <span key={model.id}>{model.label}</span>)}</div></div><Button variant="secondary" onClick={() => test.mutate(provider.id)} disabled={test.isPending}><TestTube2 size={15} /> Test</Button></article>)}</section><aside className="surface security-note"><ShieldCheck /><h2>Secret-safe by design</h2><p>API keys are never returned by provider routes or written into workflow versions. Workers resolve credential references only when a node runs.</p><ul><li><CheckCircle2 /> AES-256-GCM at rest</li><li><CheckCircle2 /> Recursive log redaction</li><li><CheckCircle2 /> Workspace-scoped lookup</li></ul></aside></div>}{test.isSuccess ? <div className="toast success"><Cable size={16} /> Provider registry responded successfully.</div> : null}{test.isError ? <div className="toast error">{test.error.message}</div> : null}</div></AppShell>;
}
