// components/admin/TrustSettingsManager.tsx
'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/Button'

import {
  ACCENT_COLOR_OPTIONS,
  type TrustSettings,
} from '@/lib/trust'

import {
  Field,
  NumberInput,
  SelectInput,
  SwitchInput,
  TextArea,
  TextInput,
} from './TrustAdminUI'

interface TrustSettingsManagerProps {
  settings: TrustSettings
  loading?: boolean
  onSave: (settings: Partial<TrustSettings>) => Promise<void>
}

export function TrustSettingsManager({
  settings,
  loading,
  onSave,
}: TrustSettingsManagerProps) {
  const [form, setForm] = useState(settings)
  const [advancedConfigText, setAdvancedConfigText] = useState('{}')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(settings)
    setAdvancedConfigText(JSON.stringify(settings.advanced_config || {}, null, 2))
  }, [settings])

  const handleSave = async () => {
    setError(null)

    let advancedConfig: Record<string, any> = {}

    try {
      advancedConfig = JSON.parse(advancedConfigText || '{}')
    } catch {
      setError('Le JSON de configuration avancée est invalide.')
      return
    }

    setSaving(true)

    try {
      await onSave({
        ...form,
        advanced_config: advancedConfig,
      })
    } catch (err: any) {
      setError(err?.message || 'Erreur lors de la sauvegarde des réglages.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Chargement des réglages...
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-base font-bold text-foreground">
          Affichage général
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Titre de section" className="sm:col-span-2">
            <TextInput
              value={form.section_title}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, section_title: value }))
              }
            />
          </Field>

          <Field label="Sous-titre" className="sm:col-span-2">
            <TextArea
              value={form.section_subtitle}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, section_subtitle: value }))
              }
              rows={3}
            />
          </Field>

          <Field label="Texte du badge">
            <TextInput
              value={form.badge_text}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, badge_text: value }))
              }
            />
          </Field>

          <Field label="Couleur d’accent">
            <SelectInput
              value={form.accent_color}
              onChange={(value) =>
                setForm((prev) => ({ ...prev, accent_color: value }))
              }
              options={ACCENT_COLOR_OPTIONS}
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SwitchInput
            checked={form.show_header}
            onChange={(checked) =>
              setForm((prev) => ({ ...prev, show_header: checked }))
            }
            label="Afficher l’en-tête"
            description="Titre, sous-titre et badge."
          />

          <SwitchInput
            checked={form.show_stats}
            onChange={(checked) =>
              setForm((prev) => ({ ...prev, show_stats: checked }))
            }
            label="Afficher les statistiques"
          />

          <SwitchInput
            checked={form.show_testimonials}
            onChange={(checked) =>
              setForm((prev) => ({ ...prev, show_testimonials: checked }))
            }
            label="Afficher les témoignages"
          />

          <SwitchInput
            checked={form.animation_enabled}
            onChange={(checked) =>
              setForm((prev) => ({ ...prev, animation_enabled: checked }))
            }
            label="Animations activées"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-base font-bold text-foreground">
          Statistiques
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Colonnes desktop" hint="Entre 1 et 12">
            <NumberInput
              value={String(form.stats_columns)}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  stats_columns: Number(value) || 8,
                }))
              }
              min={1}
              max={12}
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-4 text-base font-bold text-foreground">
          Témoignages
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mode d’affichage">
            <SelectInput
              value={form.testimonials_display_mode}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  testimonials_display_mode:
                    value === 'grid' ? 'grid' : 'rotate',
                }))
              }
              options={[
                { value: 'rotate', label: 'Rotation' },
                { value: 'grid', label: 'Grille' },
              ]}
            />
          </Field>

          <Field label="Nombre maximum affiché">
            <NumberInput
              value={String(form.testimonials_max_display)}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  testimonials_max_display: Number(value) || 1,
                }))
              }
              min={1}
              max={12}
            />
          </Field>

          <Field label="Intervalle rotation (ms)" hint="0 pour désactiver">
            <NumberInput
              value={String(form.autoplay_interval_ms)}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  autoplay_interval_ms: Number(value) || 0,
                }))
              }
              min={0}
              max={60000}
              step={500}
            />
          </Field>

          <div className="space-y-3">
            <SwitchInput
              checked={form.pause_on_hover}
              onChange={(checked) =>
                setForm((prev) => ({ ...prev, pause_on_hover: checked }))
              }
              label="Pause au survol"
            />

            <SwitchInput
              checked={form.show_rating_stars}
              onChange={(checked) =>
                setForm((prev) => ({ ...prev, show_rating_stars: checked }))
              }
              label="Afficher les étoiles"
            />

            <SwitchInput
              checked={form.show_avatar_initials}
              onChange={(checked) =>
                setForm((prev) => ({ ...prev, show_avatar_initials: checked }))
              }
              label="Afficher initiales avatar"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-2 text-base font-bold text-foreground">
          Configuration avancée JSON
        </h3>

        <p className="mb-4 text-xs text-muted-foreground">
          Réservé aux développeurs. Tu peux y stocker des options supplémentaires.
        </p>

        <Field label="JSON">
          <TextArea
            value={advancedConfigText}
            onChange={setAdvancedConfigText}
            rows={8}
            className="font-mono text-xs"
          />
        </Field>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          variant="luxe"
          onClick={handleSave}
          loading={saving}
        >
          Enregistrer les réglages
        </Button>
      </div>
    </div>
  )
}