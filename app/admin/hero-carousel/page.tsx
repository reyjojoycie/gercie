'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Trash2, Plus, Save, GripVertical, Calendar, Eye, EyeOff } from 'lucide-react';
import { toast, ToastProvider } from '@/components/ui/Toast';
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
import { SortableSlideItem } from '@/components/admin/SortableSlideItem';
import { ImageUpload } from '@/components/admin/ImageUpload';

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

export default function AdminHeroCarousel() {
  const [slides, setSlides] = useState<Slide[]>([]);
  const [direction, setDirection] = useState<'horizontal' | 'vertical'>('horizontal');
  const [intervalMs, setIntervalMs] = useState(5000);
  const [autoplayEnabled, setAutoplayEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Formulaire d'ajout
  const [newSlide, setNewSlide] = useState<Omit<Slide, 'id' | 'sort_order'>>({
    title: '',
    highlight: '',
    description: '',
    image_url: '',
    cta_label: '',
    cta_href: '',
    is_active: true,
    start_date: null,
    end_date: null,
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchSettingsAndSlides();
  }, []);

  async function fetchSettingsAndSlides() {
    setLoading(true);
    try {
      // 1. Récupérer les paramètres
      const { data: settings } = await supabaseBrowser
        .from('hero_settings')
        .select('*')
        .single();
      if (settings) {
        setDirection(settings.direction ?? 'horizontal');
        setIntervalMs(settings.interval_ms ?? 5000);
        setAutoplayEnabled(settings.autoplay_enabled ?? true);
      }

      // 2. Récupérer les slides triées par sort_order
      const { data: heroSlides, error } = await supabaseBrowser
        .from('hero_slides')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setSlides(heroSlides || []);
    } catch (err) {
      console.error(err);
      toast.addToast({ type: 'error', message: 'Erreur lors du chargement des données' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    try {
      // Récupérer l'id de la ligne settings (généralement une seule ligne)
      const { data: existing } = await supabaseBrowser
        .from('hero_settings')
        .select('id')
        .maybeSingle();
      const settingsData = { direction, interval_ms: intervalMs, autoplay_enabled: autoplayEnabled };
      if (existing) {
        await supabaseBrowser.from('hero_settings').update(settingsData).eq('id', existing.id);
      } else {
        await supabaseBrowser.from('hero_settings').insert(settingsData);
      }
      toast.addToast({ type: 'success', message: 'Paramètres mis à jour' });
    } catch (err) {
      toast.addToast({ type: 'error', message: 'Erreur lors de la sauvegarde' });
    } finally {
      setSaving(false);
    }
  }

  async function handleAddSlide(e: React.FormEvent) {
    e.preventDefault();
    if (!newSlide.image_url) {
      toast.addToast({ type: 'error', message: 'L\'image est obligatoire' });
      return;
    }

    setSaving(true);
    try {
      const maxOrder = slides.length;
      const { error } = await supabaseBrowser.from('hero_slides').insert([
        {
          ...newSlide,
          sort_order: maxOrder,
        },
      ]);
      if (error) throw error;
      toast.addToast({ type: 'success', message: 'Slide ajoutée' });
      setNewSlide({
        title: '',
        highlight: '',
        description: '',
        image_url: '',
        cta_label: '',
        cta_href: '',
        is_active: true,
        start_date: null,
        end_date: null,
      });
      await fetchSettingsAndSlides();
    } catch (err) {
      toast.addToast({ type: 'error', message: 'Erreur lors de l\'ajout' });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateSlide(id: string, updates: Partial<Slide>) {
    setUpdatingId(id);
    try {
      const { error } = await supabaseBrowser
        .from('hero_slides')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
      toast.addToast({ type: 'success', message: 'Slide mise à jour' });
      await fetchSettingsAndSlides();
    } catch (err) {
      toast.addToast({ type: 'error', message: 'Erreur lors de la mise à jour' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDeleteSlide(id: string) {
    if (!confirm('Supprimer cette bannière ?')) return;
    try {
      const { error } = await supabaseBrowser.from('hero_slides').delete().eq('id', id);
      if (error) throw error;
      toast.addToast({ type: 'success', message: 'Slide supprimée' });
      await fetchSettingsAndSlides();
    } catch (err) {
      toast.addToast({ type: 'error', message: 'Erreur lors de la suppression' });
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active.id !== over?.id) {
      const oldIndex = slides.findIndex((s) => s.id === active.id);
      const newIndex = slides.findIndex((s) => s.id === over?.id);
      const newSlides = arrayMove(slides, oldIndex, newIndex);
      setSlides(newSlides);

      // Mettre à jour les sort_order dans la base
      const updates = newSlides.map((slide, idx) => ({
        id: slide.id,
        sort_order: idx,
      }));
      try {
        for (const update of updates) {
          await supabaseBrowser
            .from('hero_slides')
            .update({ sort_order: update.sort_order })
            .eq('id', update.id);
        }
        toast.addToast({ type: 'success', message: 'Ordre mis à jour' });
      } catch (err) {
        toast.addToast({ type: 'error', message: 'Erreur lors de la réorganisation' });
        await fetchSettingsAndSlides(); // revert local state
      }
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="space-y-8 max-w-5xl mx-auto p-6">
        <div>
          <h1 className="text-2xl font-bold font-serif text-gold-400">Gestionnaire du Hero Carrousel</h1>
          <p className="text-sm text-neutral-400">
            Configure le comportement, ajoute des bannières au format 2:1, réordonne par glisser‑déposer.
          </p>
        </div>

        {/* Configuration du carrousel */}
        <div className="p-6 bg-midnight-900 border border-gold-400/20 rounded-2xl space-y-4">
          <h3 className="text-lg font-semibold text-white">Paramètres de défilement</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2 uppercase">
                Sens de défilement
              </label>
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as any)}
                className="w-full h-10 bg-black text-white border border-white/10 rounded-xl px-3 focus:ring-1 focus:ring-gold-400 outline-none"
              >
                <option value="horizontal">Horizontal (Gauche → Droite)</option>
                <option value="vertical">Vertical (Bas → Haut)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2 uppercase">
                Intervalle (ms)
              </label>
              <Input
                type="number"
                value={intervalMs}
                onChange={(e) => setIntervalMs(Number(e.target.value))}
                placeholder="5000"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-2 uppercase">
                Autoplay
              </label>
              <select
                value={autoplayEnabled ? 'true' : 'false'}
                onChange={(e) => setAutoplayEnabled(e.target.value === 'true')}
                className="w-full h-10 bg-black text-white border border-white/10 rounded-xl px-3"
              >
                <option value="true">Activé</option>
                <option value="false">Désactivé</option>
              </select>
            </div>
            <Button onClick={handleSaveSettings} disabled={saving} variant="gold" className="h-10">
              <Save size={16} className="mr-2" /> Sauvegarder
            </Button>
          </div>
        </div>

        {/* Formulaire d'ajout de slide */}
        <form onSubmit={handleAddSlide} className="p-6 bg-card border border-border rounded-2xl space-y-4">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-white">
            <Plus size={18} /> Ajouter une nouvelle bannière
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              placeholder="Titre principal"
              value={newSlide.title}
              onChange={(e) => setNewSlide({ ...newSlide, title: e.target.value })}
            />
            <Input
              placeholder="Surlignage (ex: -20%)"
              value={newSlide.highlight}
              onChange={(e) => setNewSlide({ ...newSlide, highlight: e.target.value })}
            />
          </div>
          <Input
            placeholder="Description"
            value={newSlide.description}
            onChange={(e) => setNewSlide({ ...newSlide, description: e.target.value })}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              placeholder="Texte du bouton (ex: Réserver)"
              value={newSlide.cta_label}
              onChange={(e) => setNewSlide({ ...newSlide, cta_label: e.target.value })}
            />
            <Input
              placeholder="Lien du bouton (https://...)"
              value={newSlide.cta_href}
              onChange={(e) => setNewSlide({ ...newSlide, cta_href: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Date de début (optionnelle)</label>
              <Input
                type="date"
                value={newSlide.start_date?.split('T')[0] || ''}
                onChange={(e) =>
                  setNewSlide({ ...newSlide, start_date: e.target.value || null })
                }
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Date de fin (optionnelle)</label>
              <Input
                type="date"
                value={newSlide.end_date?.split('T')[0] || ''}
                onChange={(e) =>
                  setNewSlide({ ...newSlide, end_date: e.target.value || null })
                }
              />
            </div>
          </div>

          <ImageUpload
            onUploadComplete={(url) => setNewSlide({ ...newSlide, image_url: url })}
            folder="hero"
            aspectRatio={2}
            maxSizeMB={5}
          />

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-white">
              <input
                type="checkbox"
                checked={newSlide.is_active}
                onChange={(e) => setNewSlide({ ...newSlide, is_active: e.target.checked })}
                className="rounded border-neutral-300"
              />
              Actif dès l'ajout
            </label>
          </div>

          <Button type="submit" disabled={saving} variant="luxe" className="rounded-full px-6">
            Publier la slide
          </Button>
        </form>

        {/* Liste des slides avec drag & drop */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white">
            Bannières existantes ({slides.length})
          </h3>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={slides.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {slides.map((slide) => (
                  <SortableSlideItem
                    key={slide.id}
                    slide={slide}
                    index={slides.findIndex((s) => s.id === slide.id)}
                    onUpdate={handleUpdateSlide}
                    onDelete={handleDeleteSlide}
                    isUpdating={updatingId === slide.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {slides.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Aucune bannière. Ajoutez-en une !</p>
          )}
        </div>
      </div>
    </ToastProvider>
  );
}