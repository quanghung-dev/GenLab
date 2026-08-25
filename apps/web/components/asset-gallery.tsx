'use client';

import { useQuery } from '@tanstack/react-query';
import { Boxes, FileJson, FileText, Headphones, Image as ImageIcon, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState, LoadingBlock } from '@/components/ui';
import { apiRequest, fetchAssetContent, type AssetDto } from '@/lib/api';
import { formatBytes, formatRelativeDate } from '@/lib/format';

const icons = { image: ImageIcon, video: Video, audio: Headphones, document: FileText, json: FileJson, text: FileText };

function AssetVisual({ asset }: { asset: AssetDto }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!['image', 'video', 'audio'].includes(asset.assetType)) return;
    let active = true;
    let objectUrl: string | null = null;
    void fetchAssetContent(asset.assetId).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => undefined);
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset.assetId, asset.assetType]);
  const Icon = icons[asset.assetType];
  if (asset.assetType === 'image' && url) return <img src={url} alt={asset.originalName ?? 'Generated image'} />;
  if (asset.assetType === 'video' && url) return <video src={url} muted playsInline preload="metadata" />;
  if (asset.assetType === 'audio' && url) return <div className="audio-visual"><Headphones /><audio src={url} controls /></div>;
  return <div className={`asset-placeholder asset-${asset.assetType}`}><Icon size={28} /></div>;
}

export function AssetGallery({ projectId }: { projectId?: string }) {
  const [filter, setFilter] = useState<'all' | AssetDto['assetType']>('all');
  const query = useQuery({
    queryKey: ['assets', projectId ?? 'all'],
    queryFn: () => apiRequest<readonly AssetDto[]>(`/assets${projectId ? `?projectId=${projectId}` : ''}`),
  });
  const assets = query.data?.filter((asset) => filter === 'all' || asset.assetType === filter) ?? [];
  if (query.isPending) return <LoadingBlock label="Loading assets" />;
  return (
    <>
      <div className="filter-tabs" role="tablist">
        {(['all', 'image', 'video', 'audio', 'document'] as const).map((value) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? 'All assets' : `${value[0]?.toUpperCase()}${value.slice(1)}`}</button>)}
      </div>
      {assets.length ? <div className="asset-grid">
        {assets.map((asset) => <article className="asset-card" key={asset.assetId}><div className="asset-visual"><AssetVisual asset={asset} /><span className="asset-type">{asset.assetType}</span></div><div className="asset-copy"><strong>{asset.originalName ?? asset.assetId.slice(0, 8)}</strong><span><small>{formatBytes(asset.sizeBytes)}</small><time>{formatRelativeDate(asset.createdAt)}</time></span></div></article>)}
      </div> : <EmptyState icon={<Boxes />} title="No generated assets" description={filter === 'all' ? 'Assets appear here when an image, video, or audio node completes.' : `No ${filter} assets match this filter.`} />}
    </>
  );
}
