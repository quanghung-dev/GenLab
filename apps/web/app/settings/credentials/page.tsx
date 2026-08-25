import { KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { AppShell, PageHeader } from '@/components/app-shell';

export default function CredentialsPage() {
  return <AppShell><div className="page-container"><PageHeader eyebrow="Security" title="Credentials" description="Credential records are encrypted references consumed only by execution workers." /><section className="surface credentials-explainer"><span className="large-security-icon"><KeyRound /></span><div><h2>Deployment-managed in this MVP</h2><p>GenFlow’s database contract already supports encrypted, workspace-scoped credentials. The first release intentionally accepts provider secrets through deployment configuration until create/rotate/revoke audit flows are implemented end to end.</p><div className="security-feature-grid"><span><LockKeyhole /><strong>No browser secrets</strong><small>Nodes store only a credential UUID.</small></span><span><ShieldCheck /><strong>Authenticated encryption</strong><small>AES-GCM detects tampering before use.</small></span><span><KeyRound /><strong>Rotation-ready</strong><small>Every record carries a key version.</small></span></div></div></section></div></AppShell>;
}
