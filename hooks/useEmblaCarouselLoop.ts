// hooks/useEmblaCarouselLoop.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import type { EmblaOptionsType, EmblaCarouselType } from 'embla-carousel-react';

interface UseEmblaCarouselLoopProps {
  /** Options supplémentaires pour Embla (seront fusionnées avec loop: true, align: 'start') */
  options?: EmblaOptionsType;
  /** Intervalle d'autoplay en ms (false pour désactiver) */
  autoplayInterval?: number | false;
  /** Nombre d'éléments à faire défiler par action (par défaut: 1) */
  slidesToScroll?: number;
}

/**
 * Hook personnalisé pour un carrousel infini (cylindrique) avec Embla.
 * Fournit la référence, l'API, les contrôles de navigation et l'état des boutons.
 */
export function useEmblaCarouselLoop({
  options = {},
  autoplayInterval = false,
  slidesToScroll = 1,
}: UseEmblaCarouselLoopProps = {}) {
  // Fusion des options : loop infini, alignement au début, défilement par blocs
  const mergedOptions: EmblaOptionsType = {
    loop: true,
    align: 'start',
    slidesToScroll,
    ...options,
  };

  const [emblaRef, emblaApi] = useEmblaCarousel(mergedOptions);
  const [prevBtnDisabled, setPrevBtnDisabled] = useState(true);
  const [nextBtnDisabled, setNextBtnDisabled] = useState(true);
  const autoplayTimer = useRef<NodeJS.Timeout | null>(null);

  // Met à jour l'état des boutons quand la sélection change
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setPrevBtnDisabled(!emblaApi.canScrollPrev());
    setNextBtnDisabled(!emblaApi.canScrollNext());
  }, [emblaApi]);

  // Abonnement aux événements Embla
  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Gestion de l'autoplay (si demandé)
  useEffect(() => {
    if (!autoplayInterval || !emblaApi) return;

    const play = () => {
      if (autoplayTimer.current) clearInterval(autoplayTimer.current);
      autoplayTimer.current = setInterval(() => {
        if (emblaApi.canScrollNext()) {
          emblaApi.scrollNext();
        } else {
          emblaApi.scrollTo(0); // rebouclage explicite si nécessaire
        }
      }, autoplayInterval);
    };

    const stop = () => {
      if (autoplayTimer.current) clearInterval(autoplayTimer.current);
    };

    // Interrompt l'autoplay lors d'une interaction utilisateur
    emblaApi.on('pointerDown', stop);
    emblaApi.on('scroll', stop);

    play();

    return () => {
      stop();
      emblaApi.off('pointerDown', stop);
      emblaApi.off('scroll', stop);
    };
  }, [autoplayInterval, emblaApi]);

  // Fonctions de navigation exposées
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback((index: number) => emblaApi?.scrollTo(index), [emblaApi]);

  return {
    emblaRef,               // référence à attacher au conteneur du carrousel
    emblaApi,               // instance Embla (si nécessaire)
    scrollPrev,
    scrollNext,
    scrollTo,
    prevBtnDisabled,
    nextBtnDisabled,
  };
}