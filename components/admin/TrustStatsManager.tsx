'use client';

import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Switch } from '@/components/ui/Switch'; // à adapter si vous n'avez pas Switch
import { IconPicker } from './IconPicker';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableStatItem } from './SortableStatItem';
import { Plus, Save, X, Edit, Trash2, Eye, EyeOff } from 'lucide-react';

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

export function TrustStatsManager({ stats, onStatsChange, onRefresh }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Stat>>({
    icon_name: 'Users',
    value: 0,
    suffix: '',
    prefix: '',
    label: '',
    description: '',
    color: 'text-blue-500',
    decimals: 0,
    is_active: true,
  });
  const { addToast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = stats.findIndex((s) => s.id === active.id);
      const newIndex = stats.findIndex((s) => s.id === over?.id);
      const newStats = arrayMove(stats, oldIndex, newIndex);
      onStatsChange(newStats);
      // Sauvegarde des nouveaux sort_order
      const updates = newStats.map((stat, idx) => ({ id: stat.id, sort_order: idx }));
      for (const upd of updates) {
        await supabaseBrowser.from('trust_stats').update({ sort_order: upd.sort_order }).eq('id', upd.id);
      }
      addToast({ type: 'success', message: 'Ordre mis à jour' });
    }
  };

  const handleSave = async () => {
    if (!formData.label || !formData.value) {
      addToast({ type: 'error', message: 'Le label et la valeur sont obligatoires' });
      return;
    }
    try {
      const sortOrder = editingId ? stats.find(s => s.id === editingId)?.sort_order : stats.length;
      const data = {
        ...formData,
        sort_order: sortOrder,
      };
      let error;
      if (editingId) {
        ({ error } = await supabaseBrowser.from('trust_stats').update(data).eq('id', editingId));
      } else {
        ({ error } = await supabaseBrowser.from('trust_stats').insert([data]));
      }
      if (error) throw error;
      addToast({ type: 'success', message: editingId ? 'Statistique modifiée' : 'Statistique ajoutée' });
      setIsAdding(false);
      setEditingId(null);
      setFormData({
        icon_name: 'Users',
        value: 0,
        suffix: '',
        prefix: '',
        label: '',
        description: '',
        color: 'text-blue-500',
        decimals: 0,
        is_active: true,
      });
      onRefresh();
    } catch (err) {
      addToast({ type: 'error', message: 'Erreur lors de la sauvegarde' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette statistique ?')) return;
    try {
      const { error } = await supabaseBrowser.from('trust_stats').delete().eq('id', id);
      if (error) throw error;
      addToast({ type: 'success', message: 'Statistique supprimée' });
      onRefresh();
    } catch (err) {
      addToast({ type: 'error', message: 'Erreur lors de la suppression' });
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabaseBrowser.from('trust_stats').update({ is_active: !currentActive }).eq('id', id);
      if (error) throw error;
      onRefresh();
    } catch (err) {
      addToast({ type: 'error', message: 'Erreur lors de la mise à jour' });
    }
  };

  const editItem = (stat: Stat) => {
    setEditingId(stat.id);
    setFormData(stat);
    setIsAdding(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Statistiques (jusqu'à 8 maximum)</h2>
        <Button variant="gold" size="sm" onClick={() => { setIsAdding(true); setEditingId(null); setFormData({ icon_name: 'Users', value: 0, suffix: '', prefix: '', label: '', description: '', color: 'text-blue-500', decimals: 0, is_active: true }); }}>
          <Plus size={14} className="mr-1" /> Ajouter
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={stats.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {stats.map((stat) => (
              <SortableStatItem
                key={stat.id}
                stat={stat}
                onEdit={() => editItem(stat)}
                onDelete={() => handleDelete(stat.id)}
                onToggleActive={() => toggleActive(stat.id, stat.is_active)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {isAdding && (
        <div className="mt-6 p-4 border border-gold-400/30 rounded-xl bg-card">
          <h3 className="font-semibold mb-3">{editingId ? 'Modifier' : 'Ajouter'} une statistique</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input placeholder="Label (ex: Clients actifs)" value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} />
            <Input placeholder="Valeur (ex: 15820)" type="number" value={formData.value} onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) })} />
            <Input placeholder="Suffixe (ex: +, %, jours)" value={formData.suffix} onChange={(e) => setFormData({ ...formData, suffix: e.target.value })} />
            <Input placeholder="Préfixe (ex: en , support )" value={formData.prefix} onChange={(e) => setFormData({ ...formData, prefix: e.target.value })} />
            <Input placeholder="Description courte" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            <div className="flex gap-2 items-center">
              <IconPicker value={formData.icon_name} onChange={(icon) => setFormData({ ...formData, icon_name: icon })} />
              <select value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} className="flex-1 h-10 rounded-xl border border-border bg-background px-3">
                <option value="text-blue-500">Bleu</option>
                <option value="text-green-500">Vert</option>
                <option value="text-amber-500">Ambre</option>
                <option value="text-purple-500">Violet</option>
                <option value="text-emerald-500">Émeraude</option>
                <option value="text-orange-500">Orange</option>
                <option value="text-cyan-500">Cyan</option>
                <option value="text-pink-500">Rose</option>
                <option value="text-red-500">Rouge</option>
              </select>
            </div>
            <Input placeholder="Décimales (0 pour entier)" type="number" value={formData.decimals} onChange={(e) => setFormData({ ...formData, decimals: parseInt(e.target.value) })} />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })} className="rounded" />
              Actif
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setIsAdding(false); setEditingId(null); }}>Annuler</Button>
            <Button variant="gold" onClick={handleSave}>Enregistrer</Button>
          </div>
        </div>
      )}
    </div>
  );
}