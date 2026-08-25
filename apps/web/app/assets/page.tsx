import { AppShell, PageHeader } from '@/components/app-shell';
import { AssetGallery } from '@/components/asset-gallery';

export default function AssetsPage() {
  return <AppShell><div className="page-container"><PageHeader eyebrow="Generated media" title="Assets" description="Every binary output is stored once and referenced by workflow outputs—never embedded in graph JSON." /><AssetGallery /></div></AppShell>;
}
