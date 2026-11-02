'use client';

import { useMessages } from '@/i18n/useMessages';

import type { VariationNode } from '@/lib/types';

export interface VariationTreeProps {
  nodes: VariationNode[];
  activeId: string | null;
  onSelect: (node: VariationNode) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
}

function VariationNodeView({
  node,
  depth,
  activeId,
  onSelect,
  onDelete,
  onPromote,
}: {
  node: VariationNode;
  depth: number;
  activeId: string | null;
  onSelect: (node: VariationNode) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
}) {
  const { t } = useMessages();
  const active = node.id === activeId;
  return (
    <span className="inline" style={{ marginLeft: depth > 0 ? undefined : 0 }}>
      <span
        className={`group inline-flex items-center gap-0.5 rounded px-1 py-0.5 align-baseline ${
          depth > 0 ? 'text-muted' : 'text-ink'
        }`}
        style={depth > 0 ? { fontSize: '0.92em' } : undefined}
      >
        <button
          type="button"
          onClick={() => onSelect(node)}
          aria-current={active ? 'true' : undefined}
          className={`rounded px-1 py-0.5 font-medium transition-colors ${
            active ? 'bg-accent font-bold text-[#1d2b12]' : 'hover:bg-hover'
          }`}
          style={depth > 0 ? { marginLeft: depth * 2 } : undefined}
        >
          {node.san}
        </button>
        <span className="hidden gap-0.5 group-hover:inline-flex">
          <button
            type="button"
            onClick={() => onPromote(node.id)}
            className="rounded px-1 text-[11px] text-muted hover:bg-hover hover:text-ink"
            aria-label={t('moves.promoteVariation', { san: node.san })}
            title={t('moves.promoteTitle')}
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            className="rounded px-1 text-[11px] text-muted hover:bg-hover hover:text-[#ca3431]"
            aria-label={t('moves.deleteVariation', { san: node.san })}
            title={t('moves.deleteTitle')}
          >
            ×
          </button>
        </span>
      </span>
      {node.children.length > 0 && (
        <span className="inline">
          {' '}
          {depth > 0 && <span className="text-muted">(</span>}
          {node.children.map((child) => (
            <VariationNodeView
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
              onDelete={onDelete}
              onPromote={onPromote}
            />
          ))}
          {depth > 0 && <span className="text-muted">)</span>}
        </span>
      )}
    </span>
  );
}

export default function VariationTree({
  nodes,
  activeId,
  onSelect,
  onDelete,
  onPromote,
}: VariationTreeProps) {
  const { t } = useMessages();
  if (nodes.length === 0) return null;
  return (
    <div
      className="rounded-base bg-panel p-3 text-sm leading-loose"
      aria-label={t('moves.variationsLabel')}
      style={{ paddingLeft: 12 }}
    >
      {nodes.map((node, i) => (
        <div
          key={node.id}
          className="border-l-2 border-line pl-3"
          style={{ marginLeft: i === 0 ? 0 : undefined, textIndent: 0 }}
        >
          <VariationNodeView
            node={node}
            depth={0}
            activeId={activeId}
            onSelect={onSelect}
            onDelete={onDelete}
            onPromote={onPromote}
          />
        </div>
      ))}
    </div>
  );
}
