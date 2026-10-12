'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, Calendar, Eye, EyeOff, Save } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface Slide {
  id: string;
  title: string;
  highlight: string;
  description: string;
  image_url: string;
  cta_label: string;
  cta_href: string;
  is_active: boolean;
  sort_order: number;
  start_date?: string | null;
  end_date?: string | null;
}

interface SortableSlideItemProps {
  slide: Slide;
  index: number;
  onUpdate: (id: string, updates: Partial<Slide>) => void;
  onDelete: (id: string) => void;
  isUpdating?: boolean;
}

export function SortableSlideItem({
  slide,
  index,
  onUpdate,
  onDelete,
  isUpdating = false,
}: SortableSlideItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedSlide, setEditedSlide] = useState<Partial<Slide>>({});

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleEditClick = () => {
    setEditedSlide(slide);
    setIsEditing(true);
  };

  const handleSave = () => {
    onUpdate(slide.id, editedSlide);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedSlide({});
  };

  const handleChange = (field: keyof Slide, value: string | boolean | null) => {
    setEditedSlide((prev) => ({ ...prev, [field]: value }));
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('fr-FR');
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'bg-white dark:bg-midnight-800 rounded-xl border border-neutral-200 dark:border-midnight-600 shadow-sm transition-all',
        isDragging && 'shadow-lg ring-2 ring-gold-400',
        isUpdating && 'opacity-60 pointer-events-none'
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-neutral-100 dark:hover:bg-midnight-700 rounded transition-colors"
          aria-label="Réordonner"
        >
          <GripVertical size={20} className="text-neutral-400" />
        </div>

        <div className="relative w-24 flex-shrink-0 aspect-[2/1] rounded-md overflow-hidden bg-neutral-100 dark:bg-midnight-700">
          {slide.image_url ? (
            <Image
              src={slide.image_url}
              alt={slide.title}
              fill
              className="object-cover"
              sizes="96px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-400 text-xs">
              Pas d'image
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-3">
              <Input
                value={editedSlide.title ?? ''}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Titre"
                className="text-sm"
              />
              <Input
                value={editedSlide.highlight ?? ''}
                onChange={(e) => handleChange('highlight', e.target.value)}
                placeholder="Highlight"
                className="text-sm"
              />
              <Input
                value={editedSlide.description ?? ''}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Description"
                className="text-sm"
              />
              <div className="flex gap-2">
                <Input
                  value={editedSlide.cta_label ?? ''}
                  onChange={(e) => handleChange('cta_label', e.target.value)}
                  placeholder="Bouton"
                  className="text-sm"
                />
                <Input
                  value={editedSlide.cta_href ?? ''}
                  onChange={(e) => handleChange('cta_href', e.target.value)}
                  placeholder="Lien"
                  className="text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={editedSlide.start_date?.split('T')[0] ?? ''}
                  onChange={(e) => handleChange('start_date', e.target.value || null)}
                  className="text-sm"
                />
                <Input
                  type="date"
                  value={editedSlide.end_date?.split('T')[0] ?? ''}
                  onChange={(e) => handleChange('end_date', e.target.value || null)}
                  className="text-sm"
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <span>Actif</span>
                  <input
                    type="checkbox"
                    checked={editedSlide.is_active ?? true}
                    onChange={(e) => handleChange('is_active', e.target.checked)}
                    className="rounded border-neutral-300 text-gold-500 focus:ring-gold-400"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="gold" onClick={handleSave} disabled={isUpdating}>
                  <Save size={14} className="mr-1" /> Enregistrer
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-semibold text-foreground truncate">{slide.title || 'Sans titre'}</h4>
                {slide.highlight && (
                  <Badge variant="accent" size="sm">{slide.highlight}</Badge>
                )}
                {slide.is_active ? (
                  <Badge variant="success" size="sm">
                    <Eye size={10} className="mr-1" /> Actif
                  </Badge>
                ) : (
                  <Badge variant="secondary" size="sm">
                    <EyeOff size={10} className="mr-1" /> Inactif
                  </Badge>
                )}
              </div>
              {slide.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{slide.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                {slide.cta_label && (
                  <span>🔗 {slide.cta_label}</span>
                )}
                {(slide.start_date || slide.end_date) && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {formatDate(slide.start_date)} → {formatDate(slide.end_date)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleEditClick}
              className="text-gold-600"
            >
              Modifier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(slide.id)}
              className="text-red-500 hover:text-red-700"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}