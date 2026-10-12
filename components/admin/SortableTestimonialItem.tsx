// components/admin/SortableTestimonialItem.tsx
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Edit, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role: string;
  sort_order: number;
  is_active: boolean;
}

interface SortableTestimonialItemProps {
  testimonial: Testimonial;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

export function SortableTestimonialItem({
  testimonial,
  onEdit,
  onDelete,
  onToggleActive,
}: SortableTestimonialItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: testimonial.id });

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

      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate">"{testimonial.quote}"</p>
        <p className="text-xs text-muted-foreground">
          {testimonial.author} • {testimonial.role}
        </p>
      </div>

      <Badge variant={testimonial.is_active ? 'success' : 'secondary'}>
        {testimonial.is_active ? 'Actif' : 'Inactif'}
      </Badge>

      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onToggleActive}>
          {testimonial.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
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