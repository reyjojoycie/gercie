'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTestimonialItem } from './SortableTestimonialItem';
import { Plus } from 'lucide-react';

export function TrustTestimonialsManager({ testimonials, onTestimonialsChange, onRefresh }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ quote: '', author: '', role: '', is_active: true });
  const { addToast } = useToast();

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = testimonials.findIndex(t => t.id === active.id);
      const newIndex = testimonials.findIndex(t => t.id === over?.id);
      const newList = arrayMove(testimonials, oldIndex, newIndex);
      onTestimonialsChange(newList);
      for (let i = 0; i < newList.length; i++) {
        await supabaseBrowser.from('trust_testimonials').update({ sort_order: i }).eq('id', newList[i].id);
      }
      addToast({ type: 'success', message: 'Ordre mis à jour' });
    }
  };

  const handleSave = async () => {
    if (!formData.quote || !formData.author) return;
    try {
      const { error } = await supabaseBrowser.from('trust_testimonials').insert([{ ...formData, sort_order: testimonials.length }]);
      if (error) throw error;
      addToast({ type: 'success', message: 'Témoignage ajouté' });
      setIsAdding(false);
      setFormData({ quote: '', author: '', role: '', is_active: true });
      onRefresh();
    } catch (err) {
      addToast({ type: 'error', message: 'Erreur lors de l\'ajout' });
    }
  };

  // ... fonctions d'édition/suppression similaires à TrustStatsManager (mais plus simples)

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <h2 className="text-lg font-semibold">Témoignages clients</h2>
        <Button variant="gold" size="sm" onClick={() => setIsAdding(true)}><Plus size={14} className="mr-1" /> Ajouter</Button>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={testimonials.map(t => t.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {testimonials.map((t) => (
              <SortableTestimonialItem key={t.id} testimonial={t} onRefresh={onRefresh} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {/* formulaire d'ajout/édition... */}
    </div>
  );
}