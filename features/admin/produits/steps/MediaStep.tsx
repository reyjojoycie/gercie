// features/admin/produits/steps/MediaStep.tsx
'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Trash2,
  Star,
  ChevronUp,
  ChevronDown,
  Video,
  Loader2,
} from 'lucide-react'
import { useStepContext } from '../context/ProductFormContext'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import PhotoUpload from '@/components/PhotoUpload'
import { cn } from '@/lib/utils'

export default function MediaStep() {
  const { form } = useStepContext()
  const {
    imageUrls,
    mainImageIndex,
    videoUrl,
    videoUploading,
    videoError,
    handleImageUploaded,
    removeImage,
    moveImage,
    setAsMainImage,
    onVideoUpload,
    removeVideo,
    MAX_IMAGES,
  } = form

  // user.id pour le folder supabase
  const user = form.baselineRef.current?.user_id || ''

  return (
    <motion.div
      key="media"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-5"
    >
      {/* Images */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            Images ({imageUrls.length}/{MAX_IMAGES})
          </label>
          <span className="text-xs text-muted-foreground">
            Étoile = image principale • flèches = réordonner
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <AnimatePresence>
            {imageUrls.map((url, idx) => (
              <motion.div
                key={`${url}-${idx}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={cn(
                  'group relative aspect-square overflow-hidden rounded-xl border-2',
                  idx === mainImageIndex
                    ? 'border-gold-400 ring-2 ring-gold-400/30'
                    : 'border-border'
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                  <Tooltip content="Image principale">
                    <button
                      type="button"
                      onClick={() => setAsMainImage(idx)}
                      className="rounded-full bg-white/90 p-1.5"
                    >
                      <Star
                        size={14}
                        className={
                          idx === mainImageIndex
                            ? 'text-gold-500 fill-current'
                            : 'text-neutral-500'
                        }
                      />
                    </button>
                  </Tooltip>
                  <Tooltip content="Monter">
                    <button
                      type="button"
                      onClick={() => moveImage(idx, -1)}
                      disabled={idx === 0}
                      className="rounded-full bg-white/90 p-1.5 disabled:opacity-40"
                    >
                      <ChevronUp size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Descendre">
                    <button
                      type="button"
                      onClick={() => moveImage(idx, 1)}
                      disabled={idx === imageUrls.length - 1}
                      className="rounded-full bg-white/90 p-1.5 disabled:opacity-40"
                    >
                      <ChevronDown size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Supprimer">
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="rounded-full bg-white/90 p-1.5"
                    >
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </Tooltip>
                </div>
                {idx === mainImageIndex && (
                  <Badge
                    variant="gold"
                    size="sm"
                    className="absolute left-2 top-2"
                  >
                    Principale
                  </Badge>
                )}
              </motion.div>
            ))}
            {imageUrls.length < MAX_IMAGES && (
              <div className="flex aspect-square items-center justify-center rounded-xl border-2 border-dashed border-gold-400/30 bg-muted/30">
                <PhotoUpload
                  onUpload={handleImageUploaded}
                  bucket="photos-produits"
                  folder={`${user || 'admin'}/images`}
                  label="Ajouter"
                  aspectRatio="square"
                  size="md"
                />
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Vidéo */}
      <div>
        <label className="mb-2 block text-sm font-medium text-foreground">
          Vidéo (optionnelle, max 30 Mo)
        </label>
        <div className="rounded-xl border-2 border-dashed border-gold-400/30 p-4 text-center">
          <input
            type="file"
            accept="video/*"
            onChange={onVideoUpload}
            disabled={videoUploading}
            className="hidden"
            id="video-upload"
          />
          <label
            htmlFor="video-upload"
            className="inline-flex cursor-pointer items-center gap-2 text-gold-500 hover:text-gold-600"
          >
            <Video size={18} />
            {videoUploading ? (
              <Loader2 className="animate-spin" size={18} />
            ) : videoUrl ? (
              'Modifier la vidéo'
            ) : (
              'Ajouter une vidéo'
            )}
          </label>
          {videoError && (
            <p className="mt-2 text-xs text-red-500">{videoError}</p>
          )}
          {videoUrl && (
            <div className="relative mx-auto mt-3 max-w-sm overflow-hidden rounded-xl border border-border">
              <video controls src={videoUrl} className="w-full" />
              <button
                type="button"
                onClick={removeVideo}
                className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}