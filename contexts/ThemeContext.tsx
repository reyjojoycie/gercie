// contexts/ThemeContext.tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useSyncExternalStore,
  useRef,
  ReactNode,
} from "react";

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type ThemeChoice = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

interface ThemeContextType {
  /** Le choix actuel de l'utilisateur (light, dark ou system) */
  themeChoice: ThemeChoice;
  /** Le thème résolu effectif (light ou dark) */
  resolvedTheme: ResolvedTheme;
  /** Alias de resolvedTheme (compatibilité avec les composants qui lisent `theme`) */
  theme: ResolvedTheme;
  /** Définit un nouveau choix de thème */
  setThemeChoice: (choice: ThemeChoice) => void;
  /** Bascule rapide entre light et dark (ignore "system") */
  toggleTheme: () => void;
  /** Indique si le thème est en cours de transition (pour les animations) */
  isTransitioning: boolean;
  /** Indique si le mode réduit est activé (accessibilité) */
  prefersReducedMotion: boolean;
  /** Indique si le mode contraste élevé est activé */
  prefersHighContrast: boolean;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "gercie-theme-choice";
const TRANSITION_DURATION = 300; // ms
const VALID_CHOICES: ThemeChoice[] = ["light", "dark", "system"];
const THEME_COLORS = {
  light: "#ffffff",
  dark: "#040715",
} as const;

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTEXT                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/* ═══════════════════════════════════════════════════════════════ */
/*  LOCAL STORAGE HELPERS                                          */
/* ═══════════════════════════════════════════════════════════════ */

function subscribeToLocalStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getLocalStorageThemeChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VALID_CHOICES.includes(stored as ThemeChoice)) {
      return stored as ThemeChoice;
    }
  } catch (err) {
    console.warn("Erreur lecture localStorage:", err);
  }
  return "system";
}

function setLocalStorageThemeChoice(choice: ThemeChoice) {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(STORAGE_KEY, choice);
    // Notifier les autres onglets
    window.dispatchEvent(new Event("storage"));
  } catch (err) {
    console.warn("Erreur écriture localStorage:", err);
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  THEME RESOLUTION                                               */
/* ═══════════════════════════════════════════════════════════════ */

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light"; // fallback SSR
  }
  return choice;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PROVIDER                                                       */
/* ═══════════════════════════════════════════════════════════════ */

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Stockage local synchronisé via useSyncExternalStore
  const themeChoice = useSyncExternalStore(
    subscribeToLocalStorage,
    getLocalStorageThemeChoice,
    getLocalStorageThemeChoice
  );

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(themeChoice)
  );

  // États pour accessibilité
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [prefersHighContrast, setPrefersHighContrast] = useState(false);

  // Gestion de la transition pour animations fluides
  const [isTransitioning, setIsTransitioning] = useState(false);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const previousThemeRef = useRef<ResolvedTheme>(resolvedTheme);

  /* ───────────────────────────────────────────────────────────── */
  /*  APPLICATION DU THÈME AU DOM                                  */
  /* ───────────────────────────────────────────────────────────── */

  const applyThemeToDOM = useCallback(
    (theme: ResolvedTheme, animate = true) => {
      if (typeof window === "undefined") return;

      const root = document.documentElement;
      const isDark = theme === "dark";

      // Vérifier si le thème a vraiment changé
      const hasChanged = previousThemeRef.current !== theme;
      if (!hasChanged) return;

      // Animation de transition
      if (animate && !prefersReducedMotion) {
        setIsTransitioning(true);
        if (transitionTimerRef.current) {
          clearTimeout(transitionTimerRef.current);
        }
        transitionTimerRef.current = setTimeout(() => {
          setIsTransitioning(false);
        }, TRANSITION_DURATION);
      }

      // Appliquer la classe dark
      root.classList.toggle("dark", isDark);

      // Mettre à jour colorScheme
      root.style.colorScheme = isDark ? "dark" : "light";

      // Mettre à jour les métadonnées PWA et navigateur
      try {
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
          metaTheme.setAttribute("content", THEME_COLORS[theme]);
        }

        // Pour Safari / iOS status bar
        const appleMeta = document.querySelector(
          'meta[name="apple-mobile-web-app-status-bar-style"]'
        );
        if (appleMeta) {
          appleMeta.setAttribute(
            "content",
            isDark ? "black-translucent" : "default"
          );
        }

        // Windows tiles
        const msMeta = document.querySelector(
          'meta[name="msapplication-navbutton-color"]'
        );
        if (msMeta) {
          msMeta.setAttribute("content", THEME_COLORS[theme]);
        }
      } catch (err) {
        console.warn("Erreur mise à jour meta tags:", err);
      }

      previousThemeRef.current = theme;

      // Logging en développement
      if (process.env.NODE_ENV === "development") {
        console.log("🎨 Theme applied:", {
          choice: themeChoice,
          resolved: theme,
          animate,
        });
      }
    },
    [themeChoice, prefersReducedMotion]
  );

  /* ───────────────────────────────────────────────────────────── */
  /*  APPLIQUER LE THÈME QUAND LE CHOIX CHANGE                     */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const newResolved = resolveTheme(themeChoice);
    setResolvedTheme(newResolved);
    applyThemeToDOM(newResolved);
  }, [themeChoice, applyThemeToDOM]);

  /* ───────────────────────────────────────────────────────────── */
  /*  ÉCOUTEUR DE CHANGEMENT DE PRÉFÉRENCE SYSTÈME                 */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (themeChoice !== "system" || typeof window === "undefined") return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (e: MediaQueryListEvent) => {
      const newTheme: ResolvedTheme = e.matches ? "dark" : "light";
      setResolvedTheme(newTheme);
      applyThemeToDOM(newTheme);
    };

    // Support pour anciens navigateurs
    if (mq.addEventListener) {
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    } else if (mq.addListener) {
      mq.addListener(listener);
      return () => mq.removeListener(listener);
    }
  }, [themeChoice, applyThemeToDOM]);

  /* ───────────────────────────────────────────────────────────── */
  /*  DÉTECTION PRÉFÉRENCES D'ACCESSIBILITÉ                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    // Détection prefers-reduced-motion
    const mqReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionListener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
      document.documentElement.classList.toggle("reduce-motion", e.matches);
    };

    setPrefersReducedMotion(mqReducedMotion.matches);
    document.documentElement.classList.toggle(
      "reduce-motion",
      mqReducedMotion.matches
    );

    if (mqReducedMotion.addEventListener) {
      mqReducedMotion.addEventListener("change", motionListener);
    } else if (mqReducedMotion.addListener) {
      mqReducedMotion.addListener(motionListener);
    }

    // Détection prefers-contrast: high
    const mqHighContrast = window.matchMedia("(prefers-contrast: high)");
    const contrastListener = (e: MediaQueryListEvent) => {
      setPrefersHighContrast(e.matches);
      document.documentElement.classList.toggle("high-contrast", e.matches);
    };

    setPrefersHighContrast(mqHighContrast.matches);
    document.documentElement.classList.toggle(
      "high-contrast",
      mqHighContrast.matches
    );

    if (mqHighContrast.addEventListener) {
      mqHighContrast.addEventListener("change", contrastListener);
    } else if (mqHighContrast.addListener) {
      mqHighContrast.addListener(contrastListener);
    }

    // Cleanup
    return () => {
      if (mqReducedMotion.removeEventListener) {
        mqReducedMotion.removeEventListener("change", motionListener);
      } else if (mqReducedMotion.removeListener) {
        mqReducedMotion.removeListener(motionListener);
      }

      if (mqHighContrast.removeEventListener) {
        mqHighContrast.removeEventListener("change", contrastListener);
      } else if (mqHighContrast.removeListener) {
        mqHighContrast.removeListener(contrastListener);
      }
    };
  }, []);

  /* ───────────────────────────────────────────────────────────── */
  /*  CLEANUP AU DÉMONTAGE                                         */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  /* ───────────────────────────────────────────────────────────── */
  /*  ACTIONS                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const setThemeChoice = useCallback((choice: ThemeChoice) => {
    if (!VALID_CHOICES.includes(choice)) {
      console.warn(`Choix de thème invalide: ${choice}`);
      return;
    }
    setLocalStorageThemeChoice(choice);
  }, []);

  const toggleTheme = useCallback(() => {
    const currentResolved = resolveTheme(themeChoice);
    const nextChoice: ThemeChoice = currentResolved === "dark" ? "light" : "dark";
    setLocalStorageThemeChoice(nextChoice);
  }, [themeChoice]);

  /* ───────────────────────────────────────────────────────────── */
  /*  VALEUR DU CONTEXTE                                           */
  /* ───────────────────────────────────────────────────────────── */

  const value: ThemeContextType = {
    themeChoice,
    resolvedTheme,
    theme: resolvedTheme,
    setThemeChoice,
    toggleTheme,
    isTransitioning,
    prefersReducedMotion,
    prefersHighContrast,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS CONSOMMATEURS                                            */
/* ═══════════════════════════════════════════════════════════════ */

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme doit être utilisé dans un <ThemeProvider>");
  }
  return context;
}

/**
 * Hook plus fin : retourne uniquement le thème résolu.
 */
export function useResolvedTheme(): ResolvedTheme {
  return useTheme().resolvedTheme;
}

/**
 * Hook pour la bascule simple.
 */
export function useToggleTheme() {
  const { toggleTheme } = useTheme();
  return toggleTheme;
}

/**
 * Hook indiquant si le thème est en cours de transition.
 */
export function useThemeTransition() {
  const { isTransitioning } = useTheme();
  return isTransitioning;
}

/**
 * Hook pour les préférences d'accessibilité.
 */
export function useAccessibilityPreferences() {
  const { prefersReducedMotion, prefersHighContrast } = useTheme();
  return { prefersReducedMotion, prefersHighContrast };
}
