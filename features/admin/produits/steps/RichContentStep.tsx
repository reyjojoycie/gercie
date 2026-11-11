// features/admin/produits/steps/RichContentStep.tsx
'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Sparkles,
  ExternalLink,
  AlertCircle,
  Loader2,
  X,
  Image as ImageIcon,
  Video,
  Type,
  Grid3X3,
  Quote,
  Code,
  BarChart3,
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import PhotoUpload from '@/components/PhotoUpload'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { useStepContext } from '../context/ProductFormContext'
import { RICH_TEMPLATES } from '../constants/rich-templates'
import type {
  RichContent,
  RichHero,
  RichSection,
  RichSectionType,
} from '../types'

const inputBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 disabled:opacity-60'

const textareaBase =
  'w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold-500 resize-none disabled:opacity-60'

const SECTION_TYPES: { value: RichSectionType; label: string; icon: any }[] = [
  { value: 'text_image', label: 'Texte + Image', icon: <Type size={14} /> },
  {
    value: 'features_grid',
    label: 'Grille points forts',
    icon: <Grid3X3 size={14} />,
  },
  {
    value: 'full_width_image',
    label: 'Image pleine largeur',
    icon: <ImageIcon size={14} />,
  },
  { value: 'video_block', label: 'Bloc vidéo', icon: <Video size={14} /> },
  { value: 'stats_row', label: 'Statistiques', icon: <BarChart3 size={14} /> },
  { value: 'quote', label: 'Citation', icon: <Quote size={14} /> },
  { value: 'html_safe', label: 'HTML sécurisé', icon: <Code size={14} /> },
]

function generateLocalId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `section-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function RichContentStep() {
  const { form } = useStepContext()
  const { user } = useAuth()

  const f = form as any

  const {
    richContent,
    setRichContent,
    richTemplateId,
    setRichTemplateId,
    richGenerating,
    generateRichContent,
    applyRichTemplate,
    nomWatch,
    descriptionWatch,
    imageUrls,
    videoUrl,
    specs,
    buildFullCategory,
  } = f

  const [localSourceUrl, setLocalSourceUrl] = useState<string>(
    richContent?.sourceUrl || ''
  )

  const content: RichContent = useMemo(
    () =>
      richContent || {
        enabled: false,
        sections: [],
        specs: [],
        galleries: [],
        videos: [],
      },
    [richContent]
  )

  const sections = content.sections || []
  const hero: RichHero = content.hero || {}
  const gallery = content.galleries?.[0] || {
    title: 'Galerie produit',
    images: [],
  }
  const richSpecs = content.specs || []

  const updateContent = (patch: Partial<RichContent>) => {
    setRichContent?.({
      ...content,
      ...patch,
      updatedAt: new Date().toISOString(),
    })
  }

  const updateHero = (patch: Partial<RichHero>) => {
    updateContent({
      hero: {
        ...hero,
        ...patch,
      },
    })
  }

  const updateGallery = (images: string[]) => {
    updateContent({
      galleries: [
        {
          ...gallery,
          images,
        },
      ],
    })
  }

  const addSection = (type: RichSectionType) => {
    const id = generateLocalId()

    let newSection: RichSection

    switch (type) {
      case 'text_image':
        newSection = {
          id,
          type: 'text_image',
          title: 'Nouvelle section',
          text: 'Décrivez un point fort du produit.',
          image: null,
          layout: 'image_right',
        }
        break

      case 'features_grid':
        newSection = {
          id,
          type: 'features_grid',
          title: 'Points forts',
          items: [
            { title: 'Avantage 1', description: 'Description courte.' },
            { title: 'Avantage 2', description: 'Description courte.' },
          ],
        }
        break

      case 'full_width_image':
        newSection = {
          id,
          type: 'full_width_image',
          image: '',
          caption: 'Légende image',
        }
        break

      case 'video_block':
        newSection = {
          id,
          type: 'video_block',
          url: videoUrl || '',
          title: 'Vidéo produit',
        }
        break

      case 'stats_row':
        newSection = {
          id,
          type: 'stats_row',
          items: [
            { value: '24h', label: 'Livraison' },
            { value: '2 ans', label: 'Garantie' },
          ],
        }
        break

      case 'quote':
        newSection = {
          id,
          type: 'quote',
          text: 'Une citation ou un message marketing.',
          author: 'Gercie',
        }
        break

      case 'html_safe':
        newSection = {
          id,
          type: 'html_safe',
          html: '<p>Contenu HTML sécurisé.</p>',
        }
        break

      default:
        return
    }

    updateContent({
      sections: [...sections, newSection],
    })
  }

  const updateSection = (index: number, patch: Partial<RichSection>) => {
    const next = [...sections]
    next[index] = {
      ...next[index],
      ...patch,
    } as RichSection
    updateContent({ sections: next })
  }

  const removeSection = (index: number) => {
    updateContent({
      sections: sections.filter((_, idx) => idx !== index),
    })
  }

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= sections.length) return

    const next = [...sections]
    const tmp = next[index]
    next[index] = next[target]
    next[target] = tmp

    updateContent({ sections: next })
  }

  const addRichSpec = () => {
    updateContent({
      specs: [...richSpecs, { label: '', value: '' }],
    })
  }

  const updateRichSpec = (
    index: number,
    patch: Partial<{ label: string; value: string }>
  ) => {
    const next = [...richSpecs]
    next[index] = {
      ...next[index],
      ...patch,
    }
    updateContent({ specs: next })
  }

  const removeRichSpec = (index: number) => {
    updateContent({
      specs: richSpecs.filter((_, idx) => idx !== index),
    })
  }

  const handleGenerate = async () => {
    await generateRichContent?.({
      sourceUrl: localSourceUrl,
      templateId: richTemplateId,
      productName: nomWatch,
      category: buildFullCategory?.(),
      description: descriptionWatch,
      images: imageUrls,
      videoUrl,
      specs,
    })
  }

  const handleApplyTemplate = (templateId: string) => {
    setRichTemplateId?.(templateId)
    applyRichTemplate?.(templateId)
  }

  return (
    <motion.div
      key="rich_content"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* Activation */}
      <div className="rounded-2xl border border-gold-400/20 bg-gold-500/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Sparkles size={18} className="text-gold-500" />
              Page riche du produit
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Active cette option pour afficher une présentation premium type
              Apple / Samsung / Toyota sur la fiche produit.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={Boolean(content.enabled)}
              onChange={(e) => updateContent({ enabled: e.target.checked })}
              className="rounded text-gold-500 focus:ring-gold-500"
            />
            Activer la page riche
          </label>
        </div>

        {!content.enabled && (
          <p className="mt-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <AlertCircle size={14} />
            Tant que cette option est désactivée, le produit utilisera seulement
            la description simple.
          </p>
        )}
      </div>

      {/* Template + IA */}
      <div className="grid gap-4 rounded-2xl border border-border bg-card/60 p-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            Modèle / Template
          </label>
          <select
            value={richTemplateId || 'generic'}
            onChange={(e) => setRichTemplateId?.(e.target.value)}
            className={inputBase}
          >
            {RICH_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label} — {template.description}
              </option>
            ))}
          </select>

          <Button
            type="button"
            variant="outline-gold"
            size="sm"
            className="mt-3"
            onClick={() => handleApplyTemplate(richTemplateId || 'generic')}
          >
            Appliquer ce modèle
          </Button>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-foreground">
            URL source (optionnel)
          </label>
          <input
            value={localSourceUrl}
            onChange={(e) => setLocalSourceUrl(e.target.value)}
            placeholder="https://www.apple.com/iphone-18/"
            className={inputBase}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="luxe"
              size="sm"
              onClick={handleGenerate}
              loading={richGenerating}
              leftIcon={
                richGenerating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )
              }
            >
              Générer avec IA
            </Button>

            {localSourceUrl && (
              <a
                href={localSourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold-500"
              >
                <ExternalLink size={12} />
                Ouvrir la source
              </a>
            )}
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            L’IA ne copie pas la page officielle. Elle génère une structure
            originale inspirée du produit. Tu restes maître des textes et images.
          </p>
        </div>
      </div>

      {/* Hero */}
      <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-4">
        <h4 className="font-semibold text-foreground">
          Hero / En-tête premium
        </h4>

        <div className="grid gap-4 md:grid-cols-2">
          <input
            value={hero.title || ''}
            onChange={(e) => updateHero({ title: e.target.value })}
            placeholder="Titre hero"
            className={inputBase}
          />
          <input
            value={hero.subtitle || ''}
            onChange={(e) => updateHero({ subtitle: e.target.value })}
            placeholder="Sous-titre hero"
            className={inputBase}
          />
        </div>

        <textarea
          value={hero.description || ''}
          onChange={(e) => updateHero({ description: e.target.value })}
          rows={3}
          placeholder="Description courte du hero"
          className={textareaBase}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">
              Image hero
            </label>
            {hero.image ? (
              <div className="relative h-40 overflow-hidden rounded-xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={hero.image}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => updateHero({ image: null })}
                  className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-gold-400/30 bg-muted/30">
                <PhotoUpload
                  onUpload={(url) => updateHero({ image: url })}
                  bucket="photos-produits"
                  folder={`${user?.id || 'admin'}/rich-hero`}
                  label="Uploader image hero"
                  aspectRatio="square"
                  size="md"
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <input
              value={hero.videoUrl || ''}
              onChange={(e) => updateHero({ videoUrl: e.target.value })}
              placeholder="URL vidéo hero (optionnel)"
              className={inputBase}
            />

            <select
              value={hero.ctaAction || 'none'}
              onChange={(e) =>
                updateHero({
                  ctaAction: e.target.value as RichHero['ctaAction'],
                })
              }
              className={inputBase}
            >
              <option value="none">Aucun CTA</option>
              <option value="scroll_specs">Descendre vers specs</option>
              <option value="add_to_cart">Ajouter au panier</option>
            </select>

            <input
              value={hero.ctaLabel || ''}
              onChange={(e) => updateHero({ ctaLabel: e.target.value })}
              placeholder="Libellé CTA"
              className={inputBase}
            />
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h4 className="font-semibold text-foreground">
            Sections ({sections.length})
          </h4>

          <div className="flex flex-wrap gap-2">
            {SECTION_TYPES.map((type) => (
              <Button
                key={type.value}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSection(type.value)}
                leftIcon={type.icon}
              >
                {type.label}
              </Button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {sections.map((section, index) => (
            <motion.div
              key={section.id || index}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl border border-border bg-background/60 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <Badge variant="gold" size="sm">
                  {section.type}
                </Badge>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveSection(index, -1)}
                    disabled={index === 0}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(index, 1)}
                    disabled={index === sections.length - 1}
                    className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(index)}
                    className="p-1 text-red-500 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {section.type === 'text_image' && (
                <div className="space-y-3">
                  <input
                    value={section.title || ''}
                    onChange={(e) =>
                      updateSection(index, { title: e.target.value } as any)
                    }
                    placeholder="Titre section"
                    className={inputBase}
                  />
                  <textarea
                    value={section.text || ''}
                    onChange={(e) =>
                      updateSection(index, { text: e.target.value } as any)
                    }
                    rows={4}
                    placeholder="Texte section"
                    className={textareaBase}
                  />
                  <select
                    value={section.layout || 'image_right'}
                    onChange={(e) =>
                      updateSection(index, { layout: e.target.value } as any)
                    }
                    className={inputBase}
                  >
                    <option value="image_left">Image à gauche</option>
                    <option value="image_right">Image à droite</option>
                    <option value="image_top">Image en haut</option>
                    <option value="image_center">Image centrée</option>
                  </select>

                  {section.image ? (
                    <div className="relative h-32 overflow-hidden rounded-xl border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={section.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateSection(index, { image: null } as any)
                        }
                        className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-32 items-center justify-center rounded-xl border-2 border-dashed border-gold-400/30 bg-muted/30">
                      <PhotoUpload
                        onUpload={(url) =>
                          updateSection(index, { image: url } as any)
                        }
                        bucket="photos-produits"
                        folder={`${user?.id || 'admin'}/rich-sections`}
                        label="Image section"
                        aspectRatio="square"
                        size="sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {section.type === 'features_grid' && (
                <div className="space-y-3">
                  <input
                    value={section.title || ''}
                    onChange={(e) =>
                      updateSection(index, { title: e.target.value } as any)
                    }
                    placeholder="Titre grille"
                    className={inputBase}
                  />

                  {section.items.map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-2"
                    >
                      <input
                        value={item.title || ''}
                        onChange={(e) => {
                          const items = [...section.items]
                          items[itemIndex] = {
                            ...items[itemIndex],
                            title: e.target.value,
                          }
                          updateSection(index, { items } as any)
                        }}
                        placeholder="Titre avantage"
                        className={cn(inputBase, 'py-2 text-sm')}
                      />
                      <input
                        value={item.description || ''}
                        onChange={(e) => {
                          const items = [...section.items]
                          items[itemIndex] = {
                            ...items[itemIndex],
                            description: e.target.value,
                          }
                          updateSection(index, { items } as any)
                        }}
                        placeholder="Description avantage"
                        className={cn(inputBase, 'py-2 text-sm')}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const items = section.items.filter(
                            (_, idx) => idx !== itemIndex
                          )
                          updateSection(index, { items } as any)
                        }}
                        className="text-xs text-red-500 hover:text-red-600 md:col-span-2"
                      >
                        Retirer cet avantage
                      </button>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateSection(index, {
                        items: [
                          ...section.items,
                          { title: 'Nouvel avantage', description: 'Description' },
                        ],
                      } as any)
                    }}
                    leftIcon={<Plus size={14} />}
                  >
                    Ajouter avantage
                  </Button>
                </div>
              )}

              {section.type === 'full_width_image' && (
                <div className="space-y-3">
                  <input
                    value={section.caption || ''}
                    onChange={(e) =>
                      updateSection(index, { caption: e.target.value } as any)
                    }
                    placeholder="Légende"
                    className={inputBase}
                  />

                  {section.image ? (
                    <div className="relative h-40 overflow-hidden rounded-xl border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={section.image}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateSection(index, { image: '' } as any)
                        }
                        className="absolute right-2 top-2 rounded-full bg-red-500 p-1 text-white"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-40 items-center justify-center rounded-xl border-2 border-dashed border-gold-400/30 bg-muted/30">
                      <PhotoUpload
                        onUpload={(url) =>
                          updateSection(index, { image: url } as any)
                        }
                        bucket="photos-produits"
                        folder={`${user?.id || 'admin'}/rich-full`}
                        label="Image pleine largeur"
                        aspectRatio="square"
                        size="md"
                      />
                    </div>
                  )}
                </div>
              )}

              {section.type === 'video_block' && (
                <div className="space-y-3">
                  <input
                    value={section.title || ''}
                    onChange={(e) =>
                      updateSection(index, { title: e.target.value } as any)
                    }
                    placeholder="Titre vidéo"
                    className={inputBase}
                  />
                  <input
                    value={section.url || ''}
                    onChange={(e) =>
                      updateSection(index, { url: e.target.value } as any)
                    }
                    placeholder="URL vidéo"
                    className={inputBase}
                  />
                  <input
                    value={section.poster || ''}
                    onChange={(e) =>
                      updateSection(index, { poster: e.target.value } as any)
                    }
                    placeholder="Poster (optionnel)"
                    className={inputBase}
                  />
                </div>
              )}

              {section.type === 'stats_row' && (
                <div className="space-y-3">
                  {section.items.map((item, itemIndex) => (
                    <div
                      key={itemIndex}
                      className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-2"
                    >
                      <input
                        value={item.value || ''}
                        onChange={(e) => {
                          const items = [...section.items]
                          items[itemIndex] = {
                            ...items[itemIndex],
                            value: e.target.value,
                          }
                          updateSection(index, { items } as any)
                        }}
                        placeholder="Valeur (ex : 48 MP)"
                        className={cn(inputBase, 'py-2 text-sm')}
                      />
                      <input
                        value={item.label || ''}
                        onChange={(e) => {
                          const items = [...section.items]
                          items[itemIndex] = {
                            ...items[itemIndex],
                            label: e.target.value,
                          }
                          updateSection(index, { items } as any)
                        }}
                        placeholder="Label (ex : Photo)"
                        className={cn(inputBase, 'py-2 text-sm')}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const items = section.items.filter(
                            (_, idx) => idx !== itemIndex
                          )
                          updateSection(index, { items } as any)
                        }}
                        className="text-xs text-red-500 hover:text-red-600 md:col-span-2"
                      >
                        Retirer cette stat
                      </button>
                    </div>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      updateSection(index, {
                        items: [...section.items, { value: '', label: '' }],
                      } as any)
                    }}
                    leftIcon={<Plus size={14} />}
                  >
                    Ajouter stat
                  </Button>
                </div>
              )}

              {section.type === 'quote' && (
                <div className="space-y-3">
                  <textarea
                    value={section.text || ''}
                    onChange={(e) =>
                      updateSection(index, { text: e.target.value } as any)
                    }
                    rows={3}
                    placeholder="Citation"
                    className={textareaBase}
                  />
                  <input
                    value={section.author || ''}
                    onChange={(e) =>
                      updateSection(index, { author: e.target.value } as any)
                    }
                    placeholder="Auteur"
                    className={inputBase}
                  />
                </div>
              )}

              {section.type === 'html_safe' && (
                <div className="space-y-3">
                  <textarea
                    value={section.html || ''}
                    onChange={(e) =>
                      updateSection(index, { html: e.target.value } as any)
                    }
                    rows={6}
                    placeholder="<p>HTML sécurisé</p>"
                    className={cn(textareaBase, 'font-mono text-xs')}
                  />
                  <p className="text-xs text-muted-foreground">
                    Les scripts et iframes sont supprimés automatiquement.
                  </p>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {sections.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune section. Ajoute-en une ou génère avec IA.
          </p>
        )}
      </div>

      {/* Specs riches */}
      <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-foreground">
            Caractéristiques premium
          </h4>
          <Button
            type="button"
            variant="outline-gold"
            size="sm"
            onClick={addRichSpec}
            leftIcon={<Plus size={14} />}
          >
            Ajouter ligne
          </Button>
        </div>

        {richSpecs.map((spec, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-2"
          >
            <input
              value={spec.label || ''}
              onChange={(e) => updateRichSpec(index, { label: e.target.value })}
              placeholder="Label (ex : Puce)"
              className={cn(inputBase, 'py-2 text-sm')}
            />
            <input
              value={spec.value || ''}
              onChange={(e) => updateRichSpec(index, { value: e.target.value })}
              placeholder="Valeur (ex : A19 Pro)"
              className={cn(inputBase, 'py-2 text-sm')}
            />
            <button
              type="button"
              onClick={() => removeRichSpec(index)}
              className="text-xs text-red-500 hover:text-red-600 md:col-span-2"
            >
              Retirer cette ligne
            </button>
          </div>
        ))}

        {richSpecs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucune caractéristique premium. Tu peux copier depuis les specs
            simples ou générer avec IA.
          </p>
        )}
      </div>

      {/* Galerie */}
      <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-4">
        <h4 className="font-semibold text-foreground">Galerie page riche</h4>

        <input
          value={gallery.title || ''}
          onChange={(e) =>
            updateContent({
              galleries: [{ ...gallery, title: e.target.value }],
            })
          }
          placeholder="Titre galerie"
          className={inputBase}
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <AnimatePresence>
            {gallery.images.map((image, index) => (
              <motion.div
                key={`${image}-${index}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="relative aspect-square overflow-hidden rounded-xl border border-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateGallery(
                      gallery.images.filter((_, idx) => idx !== index)
                    )
                  }
                  className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white"
                >
                  <X size={12} />
                </button>
              </motion.div>
            ))}

            <div className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-gold-400/30 bg-muted/30">
              <PhotoUpload
                onUpload={(url) => updateGallery([...gallery.images, url])}
                bucket="photos-produits"
                folder={`${user?.id || 'admin'}/rich-gallery`}
                label="Ajouter"
                aspectRatio="square"
                size="sm"
              />
            </div>
          </AnimatePresence>
        </div>
      </div>

      {/* CTA final */}
      <div className="space-y-4 rounded-2xl border border-border bg-card/60 p-4">
        <h4 className="font-semibold text-foreground">CTA final</h4>

        <input
          value={content.finalCta?.title || ''}
          onChange={(e) =>
            updateContent({
              finalCta: {
                ...(content.finalCta || {}),
                title: e.target.value,
              },
            })
          }
          placeholder="Titre CTA final"
          className={inputBase}
        />

        <textarea
          value={content.finalCta?.description || ''}
          onChange={(e) =>
            updateContent({
              finalCta: {
                ...(content.finalCta || {}),
                description: e.target.value,
              },
            })
          }
          rows={2}
          placeholder="Description CTA final"
          className={textareaBase}
        />

        <input
          value={content.finalCta?.buttonLabel || ''}
          onChange={(e) =>
            updateContent({
              finalCta: {
                ...(content.finalCta || {}),
                buttonLabel: e.target.value,
              },
            })
          }
          placeholder="Libellé bouton"
          className={inputBase}
        />
      </div>
    </motion.div>
  )
}