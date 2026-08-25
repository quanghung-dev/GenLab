'use client';

import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui';
import type { NodeDefinitionDto } from '@/stores/editor-store';

export function NodeLibrary({ definitions, onAdd }: { definitions: readonly NodeDefinitionDto[]; onAdd: (definition: NodeDefinitionDto) => void }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const filtered = definitions.filter((item) => `${item.label} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
    return Object.groupBy(filtered, (item) => item.category);
  }, [definitions, query]);
  return (
    <aside className="node-library editor-panel">
      <div className="editor-panel-heading"><div><span className="eyebrow">Blocks</span><h2>Node library</h2></div></div>
      <label className="search-field"><Search size={15} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes" /></label>
      <div className="node-groups">
        {Object.entries(groups).map(([category, items]) => (
          <section key={category}><h3>{category}</h3><div>
            {items?.map((definition) => (
              <button
                type="button"
                className="library-node"
                key={definition.type}
                onClick={() => onAdd(definition)}
                draggable
                onDragStart={(event) => { event.dataTransfer.setData('application/genflow-node', definition.type); event.dataTransfer.effectAllowed = 'move'; }}
              >
                <i style={{ background: definition.ui.accent }} /><span><strong>{definition.label}</strong><small>{definition.description}</small></span><em>+</em>
              </button>
            ))}
          </div></section>
        ))}
      </div>
    </aside>
  );
}
