// components/admin/SortableStatItem.tsx
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Edit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface Stat {
  id: string;
  icon_name: string;
  value: number;
  suffix: string;
  prefix: string;
  label: string;
  description: string;
  color: string;
  decimals: number;
  sort_order: number;
  is_active: boolean;
}

interface SortableStatItemProps {
  stat: Stat;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

export function SortableStatItem({
  stat,
  onEdit,
  onDelete,
  onToggleActive,
}: SortableStatItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card rounded-xl border border-border p-3 flex items-center gap-3"
    >
      <div {...attributes} {...listeners} className="cursor-grab p-1">
        <GripVertical size={20} className="text-muted-foreground" />
      </div>

      <div className={cn('w-10 h-10 rounded-full bg-secondary flex items-center justify-center', stat.color)}>
        <span className="text-lg font-bold">{stat.icon_name?.[0]}</span>
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">{stat.label}</p>
        <p className="text-xs text-muted-foreground">
          {stat.value}{stat.suffix} {stat.description}
        </p>
      </div>

      <Badge variant={stat.is_active ? 'success' : 'secondary'}>
        {stat.is_active ? 'Actif' : 'Inactif'}
      </Badge>

      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onToggleActive}>
          {stat.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          <Edit size={14} />
        </Button>
        <Button size="sm" variant="ghost" className="text-red-500" onClick={onDelete}>
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  );
}