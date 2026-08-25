'use client';

import { useParams } from 'next/navigation';
import { AppShell, PageHeader } from '@/components/app-shell';
import { AssetGallery } from '@/components/asset-gallery';

export default function ProjectAssetsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <AppShell><div className="page-container"><PageHeader eyebrow="Project media" title="Assets" description="Generated outputs scoped to this project." /><AssetGallery projectId={projectId} /></div></AppShell>;
}
