// components/ProductGallery.tsx
'use client'

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react'
import Image from 'next/image'
import { motion, AnimatePresence, useDragControls, type PanInfo } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Tooltip } from '@/components/ui/Tooltip'
import { Modal } from '@/components/ui/Modal'
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  Maximize2,
  X,
  Camera,
  Eye,
  RotateCw,
  ImagePlus,
  ChevronUp,
  ChevronDown,
} from 'lucide-react'

/* ========================================================================== */
/*  Types                                                                     */
/* ========================================================================== */

export interface MediaItem {
  /** Type de média */
  type: 'image' | 'video'
  /** URL de la source */
  url: string
  /** URL alternative pour le zoom / HD */
  hdUrl?: string
  /** Légende (optionnelle) */
  caption?: string
  /** Miniature personnalisée (sinon générée à partir de url) */
  thumbnail?: string
}

export interface ProductGalleryProps {
  /** Liste des médias (images et/ou vidéos) */
  items: MediaItem[]
  /** Index de l'élément affiché par défaut */
  defaultIndex?: number
  /** Hauteur du conteneur principal (ex: '500px', '70vh') */
  height?: string
  /** Ratio d'aspect (ex: '1/1', '4/3', '16/9') – prioritaire si pas de height */
  aspectRatio?: string
  /** Disposition de la galerie */
  layout?: 'stacked' | 'grid' | 'carousel' | 'single'
  /** Taille des colonnes en mode grid */
  gridCols?: 2 | 3 | 4 | 5
  /** Afficher les miniatures */
  showThumbnails?: boolean
  /** Position des miniatures */
  thumbnailPosition?: 'bottom' | 'left' | 'right'
  /** Taille des miniatures (px) */
  thumbnailSize?: number
  /** Activer le zoom au survol (mode loupe) */
  enableZoom?: boolean
  /** Activer le mode plein écran */
  enableFullscreen?: boolean
  /** Lecture automatique des vidéos */
  autoPlayVideo?: boolean
  /** Afficher les flèches de navigation */
  showArrows?: boolean
  /** Afficher les indicateurs (points) */
  showDots?: boolean
  /** Afficher le compteur d'images (ex: 3/10) */
  showCounter?: boolean
  /** Afficher les badges (stock, promo) */
  badges?: React.ReactNode[]
  /** Afficher un bouton "Ajouter des photos" (pour les avis) */
  showAddPhotoButton?: boolean
  onAddPhoto?: () => void
  /** Callback au changement d'index */
  onIndexChange?: (index: number) => void
  /** Classe additionnelle */
  className?: string
}

/* ========================================================================== */
/*  Composant ProductGallery                                                  */
/* ========================================================================== */

export const ProductGallery = forwardRef<HTMLDivElement, ProductGalleryProps>(
  (
    {
      items,
      defaultIndex = 0,
      height,
      aspectRatio = '4/3',
      layout = 'single',
      gridCols = 4,
      showThumbnails = true,
      thumbnailPosition = 'bottom',
      thumbnailSize = 72,
      enableZoom = true,
      enableFullscreen = true,
      autoPlayVideo = false,
      showArrows = true,
      showDots = true,
      showCounter = true,
      badges = [],
      showAddPhotoButton = false,
      onAddPhoto,
      onIndexChange,
      className,
    },
    ref
  ) => {
    const [currentIndex, setCurrentIndex] = useState(defaultIndex)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [isZoomed, setIsZoomed] = useState(false)
    const [zoomPosition, setZoomPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [loadedItems, setLoadedItems] = useState<Set<number>>(new Set())
    const [touchStart, setTouchStart] = useState<number | null>(null)

    const containerRef = useRef<HTMLDivElement>(null)
    const imageContainerRef = useRef<HTMLDivElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const dragControls = useDragControls()

    useImperativeHandle(ref, () => containerRef.current as HTMLDivElement)

    const currentItem = items[currentIndex] || items[0]
    const totalItems = items.length
    const hasPrev = currentIndex > 0
    const hasNext = currentIndex < totalItems - 1

    // Changer d'index avec notification au parent
    const goTo = useCallback(
      (index: number) => {
        if (index < 0 || index >= totalItems) return
        setCurrentIndex(index)
        onIndexChange?.(index)
      },
      [totalItems, onIndexChange]
    )

    const goNext = () => goTo(currentIndex + 1)
    const goPrev = () => goTo(currentIndex - 1)

    // Gestion du zoom (loupe)
    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!enableZoom || !isZoomed || !imageContainerRef.current) return
      const rect = imageContainerRef.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100
      setZoomPosition({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) })
    }

    const toggleZoom = () => {
      if (!enableZoom) return
      setIsZoomed(!isZoomed)
    }

    // Gestion tactile (swipe)
    const handleTouchStart = (e: React.TouchEvent) => {
      setTouchStart(e.touches[0].clientX)
    }

    const handleTouchEnd = (e: React.TouchEvent) => {
      if (touchStart === null) return
      const touchEnd = e.changedTouches[0].clientX
      const diff = touchStart - touchEnd
      if (Math.abs(diff) > 50) {
        diff > 0 ? goNext() : goPrev()
      }
      setTouchStart(null)
    }

    // Gestion du drag (framer-motion)
    const handleDragEnd = (_: any, info: PanInfo) => {
      if (info.offset.x > 100) goPrev()
      else if (info.offset.x < -100) goNext()
      setIsDragging(false)
    }

    // Préchargement des images adjacentes
    useEffect(() => {
      const newLoaded = new Set(loadedItems)
      newLoaded.add(currentIndex)
      if (hasPrev) newLoaded.add(currentIndex - 1)
      if (hasNext) newLoaded.add(currentIndex + 1)
      setLoadedItems(newLoaded)
    }, [currentIndex, hasPrev, hasNext])

    // Lecture automatique des vidéos
    useEffect(() => {
      if (currentItem?.type === 'video' && videoRef.current && autoPlayVideo) {
        videoRef.current.play().catch(() => {})
      }
    }, [currentIndex, currentItem, autoPlayVideo])

    // Raccourcis clavier
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); goNext() }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev() }
        else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault()
          if (enableFullscreen) setIsFullscreen(prev => !prev)
        }
      }
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }, [goNext, goPrev, enableFullscreen])

    // Styles de conteneur principal
    const containerStyle = height
      ? { height }
      : { aspectRatio }

    // Grille de miniatures
    const Thumbnails = () => (
      <div className={cn(
        'flex gap-2',
        thumbnailPosition === 'bottom' ? 'flex-row overflow-x-auto pb-1 scrollbar-hide' : 'flex-col overflow-y-auto pr-1 scrollbar-hide'
      )}>
        {items.map((item, index) => (
          <button
            key={index}
            onClick={() => goTo(index)}
            className={cn(
              'relative rounded-xl overflow-hidden border-2 flex-shrink-0 transition-all duration-300',
              index === currentIndex
                ? 'border-gold-400 shadow-gold'
                : 'border-transparent opacity-60 hover:opacity-100 hover:border-gold-400/40',
            )}
            style={{ width: thumbnailSize, height: thumbnailSize }}
          >
            {item.type === 'image' ? (
              <Image
                src={item.thumbnail || item.url}
                alt={item.caption || `Image ${index + 1}`}
                fill
                className="object-cover"
                sizes={`${thumbnailSize}px`}
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
                <Play size={20} className="text-neutral-500" />
              </div>
            )}
          </button>
        ))}
      </div>
    )

    // Rendu du conteneur principal
    const renderMainContent = () => (
      <div
        ref={imageContainerRef}
        className="relative flex-1 overflow-hidden rounded-2xl bg-neutral-100 dark:bg-midnight-800/40 group"
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0"
            drag="x"
            dragControls={dragControls}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
          >
            {currentItem?.type === 'video' ? (
              <video
                ref={videoRef}
                src={currentItem.url}
                controls
                autoPlay={autoPlayVideo}
                muted={autoPlayVideo}
                loop
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              <div
                className={cn(
                  'w-full h-full relative',
                  isZoomed && 'cursor-zoom-out',
                  !isZoomed && enableZoom && 'cursor-zoom-in'
                )}
                onClick={toggleZoom}
              >
                <Image
                  src={currentItem?.url || '/placeholder.jpg'}
                  alt={currentItem?.caption || `Image ${currentIndex + 1}`}
                  fill
                  className={cn(
                    'object-contain transition-transform duration-300',
                    isZoomed ? 'scale-150' : 'group-hover:scale-105'
                  )}
                  style={
                    isZoomed
                      ? {
                          transformOrigin: `${zoomPosition.x}% ${zoomPosition.y}%`,
                        }
                      : undefined
                  }
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 60vw, 50vw"
                  priority={currentIndex === 0}
                  quality={90}
                />
                {/* Effet loupe amélioré */}
                {isZoomed && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      backgroundImage: `url(${currentItem?.hdUrl || currentItem?.url})`,
                      backgroundSize: '200%',
                      backgroundPosition: `${zoomPosition.x}% ${zoomPosition.y}%`,
                      backgroundRepeat: 'no-repeat',
                      opacity: 1,
                    }}
                  />
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Badges (stock, promo, etc.) */}
        {badges.length > 0 && (
          <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
            {badges.map((badge, idx) => (
              <div key={idx}>{badge}</div>
            ))}
          </div>
        )}

        {/* Bouton zoom / plein écran */}
        <div className="absolute top-3 right-3 flex gap-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          {enableZoom && currentItem?.type === 'image' && (
            <Tooltip content={isZoomed ? 'Réduire' : 'Zoom'}>
              <button
                onClick={toggleZoom}
                className="p-2 bg-white/80 dark:bg-black/50 backdrop-blur-sm rounded-full hover:bg-white transition-colors"
              >
                {isZoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
              </button>
            </Tooltip>
          )}
          {enableFullscreen && (
            <Tooltip content="Plein écran">
              <button
                onClick={() => setIsFullscreen(true)}
                className="p-2 bg-white/80 dark:bg-black/50 backdrop-blur-sm rounded-full hover:bg-white transition-colors"
              >
                <Maximize2 size={18} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Flèches de navigation */}
        {showArrows && totalItems > 1 && (
          <>
            <button
              onClick={goPrev}
              disabled={!hasPrev}
              className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-sm shadow-lg hover:bg-white transition-all z-10',
                'opacity-0 group-hover:opacity-100',
                !hasPrev && 'opacity-30 cursor-not-allowed'
              )}
              aria-label="Image précédente"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={goNext}
              disabled={!hasNext}
              className={cn(
                'absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-sm shadow-lg hover:bg-white transition-all z-10',
                'opacity-0 group-hover:opacity-100',
                !hasNext && 'opacity-30 cursor-not-allowed'
              )}
              aria-label="Image suivante"
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}

        {/* Compteur */}
        {showCounter && totalItems > 1 && (
          <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm text-white text-xs px-3 py-1 rounded-full z-10">
            {currentIndex + 1} / {totalItems}
          </div>
        )}

        {/* Indicateurs (points) */}
        {showDots && totalItems > 1 && (
          <div className="absolute bottom-3 right-3 flex gap-1.5 z-10">
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => goTo(idx)}
                className={cn(
                  'w-2 h-2 rounded-full transition-all duration-300',
                  idx === currentIndex
                    ? 'bg-gold-400 w-4'
                    : 'bg-white/60 hover:bg-white/90'
                )}
                aria-label={`Aller à l'image ${idx + 1}`}
              />
            ))}
          </div>
        )}

        {/* Bouton "Ajouter des photos" */}
        {showAddPhotoButton && onAddPhoto && (
          <button
            onClick={onAddPhoto}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-white dark:bg-neutral-800 shadow-lg rounded-full px-4 py-2 text-sm font-medium flex items-center gap-2 hover:bg-gold-50 transition-colors z-10"
          >
            <Camera size={16} />
            Ajouter des photos
          </button>
        )}
      </div>
    )

    // Rendu selon la disposition
    const galleryContent = (
      <div
        ref={containerRef}
        className={cn('flex', layout === 'grid' ? 'flex-col' : 'gap-4', className)}
        style={layout !== 'grid' ? containerStyle : undefined}
      >
        {/* Layout : single (image + miniatures en dessous) */}
        {layout === 'single' && (
          <>
            {thumbnailPosition === 'left' && showThumbnails && <Thumbnails />}
            <div className="flex-1 flex flex-col">
              {renderMainContent()}
              {thumbnailPosition === 'bottom' && showThumbnails && (
                <div className="mt-4">
                  <Thumbnails />
                </div>
              )}
            </div>
            {thumbnailPosition === 'right' && showThumbnails && <Thumbnails />}
          </>
        )}

        {/* Layout : carousel (défilement horizontal) */}
        {layout === 'carousel' && (
          <div className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4">
            {items.map((item, idx) => (
              <div key={idx} className="snap-center flex-shrink-0 w-full" style={containerStyle}>
                {/* Simplifié ici, réutiliser un sous-composant si besoin */}
              </div>
            ))}
          </div>
        )}

        {/* Layout : grid */}
        {layout === 'grid' && (
          <div className={cn('grid gap-4', `grid-cols-${gridCols}`)}>
            {items.map((item, idx) => (
              <div key={idx} className="aspect-square relative rounded-xl overflow-hidden cursor-pointer" onClick={() => goTo(idx)}>
                <Image src={item.url} alt={item.caption || ''} fill className="object-cover hover:scale-105 transition-transform" sizes="25vw" />
              </div>
            ))}
          </div>
        )}

        {/* Layout : stacked */}
        {layout === 'stacked' && (
          <div className="flex flex-col gap-4">
            {items.map((item, idx) => (
              <div key={idx} className="relative rounded-xl overflow-hidden" style={containerStyle}>
                {item.type === 'image' ? (
                  <Image src={item.url} alt={item.caption || ''} fill className="object-cover" sizes="100vw" />
                ) : (
                  <video src={item.url} controls className="w-full h-full object-contain" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )

    return (
      <>
        {galleryContent}

        {/* Modal plein écran */}
        {enableFullscreen && (
          <Modal
            isOpen={isFullscreen}
            onClose={() => setIsFullscreen(false)}
            size="full"
            accent="neutral"
            showCloseButton={false}
            bodyClassName="p-0"
            className="bg-black"
          >
            <div className="relative w-full h-screen flex items-center justify-center">
              <button
                onClick={() => setIsFullscreen(false)}
                className="absolute top-4 right-4 z-10 p-2 bg-white/10 backdrop-blur-sm rounded-full hover:bg-white/30 transition-colors text-white"
              >
                <X size={24} />
              </button>
              <div className="absolute inset-0 flex items-center justify-center p-8">
                <motion.div
                  key={currentIndex}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full relative"
                >
                  {currentItem?.type === 'video' ? (
                    <video src={currentItem.url} controls autoPlay className="w-full h-full object-contain" />
                  ) : (
                    <Image
                      src={currentItem?.hdUrl || currentItem?.url || '/placeholder.jpg'}
                      alt={currentItem?.caption || ''}
                      fill
                      className="object-contain"
                      sizes="100vw"
                      quality={100}
                    />
                  )}
                </motion.div>
              </div>
              {totalItems > 1 && (
                <>
                  <button onClick={goPrev} className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 rounded-full hover:bg-white/30 text-white">
                    <ChevronLeft size={24} />
                  </button>
                  <button onClick={goNext} className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 rounded-full hover:bg-white/30 text-white">
                    <ChevronRight size={24} />
                  </button>
                </>
              )}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                {items.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goTo(idx)}
                    className={cn(
                      'w-3 h-3 rounded-full transition-all',
                      idx === currentIndex ? 'bg-gold-400 scale-125' : 'bg-white/40'
                    )}
                  />
                ))}
              </div>
            </div>
          </Modal>
        )}
      </>
    )
  }
)

ProductGallery.displayName = 'ProductGallery'