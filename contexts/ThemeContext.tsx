// contexts/ThemeContext.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export type ThemeChoice = "light" | "dark" | "system";
export type ThemeMode = "auto" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  /** Choix persisté de l'utilisateur */
  themeChoice: ThemeChoice;

  /** Mode exposé à la navbar : auto / light / dark */
  themeMode: ThemeMode;

  /** Thème réellement appliqué */
  resolvedTheme: ResolvedTheme;

  /** Alias pour compatibilité */
  theme: ResolvedTheme;

  /** Définit un choix explicite */
  setThemeChoice: (choice: ThemeChoice) => void;

  /** Définit un mode compatible navbar */
  setThemeMode: (mode: ThemeMode) => void;

  /** Cycle : auto -> light -> dark -> auto */
  cycleTheme: () => void;

  /** Alias pour NavbarActions */
  onThemeCycle: () => void;

  /** Bascule simple light <-> dark */
  toggleTheme: () => void;

  /** Transition visuelle en cours */
  isTransitioning: boolean;

  /** Hydratation client terminée */
  isHydrated: boolean;

  /** Préférence accessibilité : mouvement réduit */
  prefersReducedMotion: boolean;

  /** Préférence accessibilité : contraste élevé */
  prefersHighContrast: boolean;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "gercie-theme";

const LEGACY_STORAGE_KEYS = [
  "gercie-theme-choice",
  "theme",
] as const;

const THEME_EVENT = "gercie-theme-change";

const VALID_CHOICES = new Set<ThemeChoice>(["light", "dark", "system"]);

const TRANSITION_DURATION = 280;

/**
 * Couleurs alignées sur la nouvelle fondation visuelle.
 *
 * Light  : blanc cassé lumineux, pas blanc pur agressif
 * Dark   : minuit profond, pas noir pur
 */
const THEME_COLORS = {
  light: "#f8f8f5",
  dark: "#070a14",
} as const;

/* ═══════════════════════════════════════════════════════════════ */
/*  CONTEXT                                                        */
/* ═══════════════════════════════════════════════════════════════ */

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/* ═══════════════════════════════════════════════════════════════ */
/*  DOM HELPERS                                                    */
/* ═══════════════════════════════════════════════════════════════ */

function canUseDOM(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function normalizeStoredTheme(value: string | null | undefined): ThemeChoice | null {
  if (!value) return null;

  if (value === "auto") return "system";
  if (value === "light") return "light";
  if (value === "dark") return "dark";
  if (value === "system") return "system";

  return null;
}

function readThemeChoice(): ThemeChoice {
  if (!canUseDOM()) return "system";

  try {
    const primary = normalizeStoredTheme(window.localStorage.getItem(STORAGE_KEY));
    if (primary) return primary;

    for (const key of LEGACY_STORAGE_KEYS) {
      const legacy = normalizeStoredTheme(window.localStorage.getItem(key));
      if (legacy) return legacy;
    }
  } catch {
    // localStorage peut être bloqué en private browsing / restrictions navigateur
  }

  return "system";
}

function writeThemeChoice(choice: ThemeChoice): void {
  if (!canUseDOM()) return;

  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
    window.dispatchEvent(new Event(THEME_EVENT));
  } catch {
    // silencieux : le thème peut quand même être appliqué en mémoire
  }
}

function subscribeToThemeChanges(callback: () => void): () => void {
  if (!canUseDOM()) return () => {};

  const handler = () => callback();

  window.addEventListener("storage", handler);
  window.addEventListener(THEME_EVENT, handler);

  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(THEME_EVENT, handler);
  };
}

function getThemeSnapshot(): ThemeChoice {
  return readThemeChoice();
}

function getServerThemeSnapshot(): ThemeChoice {
  return "system";
}

/* ═══════════════════════════════════════════════════════════════ */
/*  THEME RESOLUTION                                               */
/* ═══════════════════════════════════════════════════════════════ */

function getSystemTheme(): ResolvedTheme {
  if (!canUseDOM() || !window.matchMedia) return "light";

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") return getSystemTheme();
  return choice;
}

/**
 * Lit l'état déjà appliqué dans le DOM par le script d'initialisation
 * afin d'éviter un mismatch d'hydratation.
 */
function getInitialResolvedTheme(): ResolvedTheme {
  if (!canUseDOM()) return "light";

  const root = document.documentElement;

  if (root.dataset.theme === "dark") return "dark";
  if (root.dataset.theme === "light") return "light";

  if (root.classList.contains("dark")) return "dark";

  return resolveTheme(readThemeChoice());
}

/* ═══════════════════════════════════════════════════════════════ */
/*  META SYNC                                                      */
/* ═══════════════════════════════════════════════════════════════ */

function updateThemeMeta(theme: ResolvedTheme): void {
  if (!canUseDOM()) return;

  const color = THEME_COLORS[theme];

  /**
   * Plusieurs metas theme-color peuvent exister avec des media queries.
   * Pour un thème forcé par l'utilisateur, on normalise sur une seule meta.
   */
  const metas = Array.from(document.querySelectorAll('meta[name="theme-color"]'));

  if (metas.length === 0) {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    meta.setAttribute("content", color);
    document.head.appendChild(meta);
  } else {
    const primary = metas[0];
    primary.setAttribute("content", color);
    primary.removeAttribute("media");

    metas.slice(1).forEach((meta) => meta.remove());
  }

  const appleMeta = document.querySelector(
    'meta[name="apple-mobile-web-app-status-bar-style"]'
  );

  if (appleMeta) {
    appleMeta.setAttribute(
      "content",
      theme === "dark" ? "black-translucent" : "default"
    );
  }

  const msMeta = document.querySelector('meta[name="msapplication-navbutton-color"]');

  if (msMeta) {
    msMeta.setAttribute("content", color);
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  PROVIDER                                                       */
/* ═══════════════════════════════════════════════════════════════ */

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeChoice = useSyncExternalStore(
    subscribeToThemeChanges,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    getInitialResolvedTheme()
  );

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [prefersHighContrast, setPrefersHighContrast] = useState(false);

  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousThemeRef = useRef<ResolvedTheme | null>(null);
  const mountedRef = useRef(false);

  /* ───────────────────────────────────────────────────────────── */
  /*  TRANSITION TIMER                                             */
  /* ───────────────────────────────────────────────────────────── */

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }, []);

  /* ───────────────────────────────────────────────────────────── */
  /*  APPLY THEME TO DOM                                           */
  /* ───────────────────────────────────────────────────────────── */

  const applyThemeToDOM = useCallback(
    (theme: ResolvedTheme, animate = true) => {
      if (!canUseDOM()) return;

      const root = document.documentElement;
      const isDark = theme === "dark";
      const hasChanged = previousThemeRef.current !== theme;

      if (hasChanged && animate && !prefersReducedMotion && mountedRef.current) {
        setIsTransitioning(true);
        clearTransitionTimer();

        transitionTimerRef.current = setTimeout(() => {
          setIsTransitioning(false);
        }, TRANSITION_DURATION);
      }

      root.classList.toggle("dark", isDark);
      root.dataset.theme = theme;
      root.style.colorScheme = isDark ? "dark" : "light";

      updateThemeMeta(theme);

      previousThemeRef.current = theme;
    },
    [clearTransitionTimer, prefersReducedMotion]
  );

  /* ───────────────────────────────────────────────────────────── */
  /*  MOUNT                                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    mountedRef.current = true;
    setIsHydrated(true);

    // Application initiale sans animation pour éviter un flash visuel.
    applyThemeToDOM(resolvedTheme, false);

    return () => {
      clearTransitionTimer();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ───────────────────────────────────────────────────────────── */
  /*  SYNC WHEN CHOICE CHANGES                                     */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const nextTheme = resolveTheme(themeChoice);

    setResolvedTheme((prev) => (prev === nextTheme ? prev : nextTheme));
    applyThemeToDOM(nextTheme, mountedRef.current);
  }, [themeChoice, applyThemeToDOM]);

  /* ───────────────────────────────────────────────────────────── */
  /*  SYSTEM THEME LISTENER                                        */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (themeChoice !== "system") return;
    if (!canUseDOM() || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const listener = (event: MediaQueryListEvent) => {
      const nextTheme: ResolvedTheme = event.matches ? "dark" : "light";

      setResolvedTheme(nextTheme);
      applyThemeToDOM(nextTheme, true);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }

    // Fallback anciens navigateurs
    const legacyMediaQuery = mediaQuery as MediaQueryList & {
      addListener?: (callback: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (callback: (event: MediaQueryListEvent) => void) => void;
    };

    legacyMediaQuery.addListener?.(listener);

    return () => {
      legacyMediaQuery.removeListener?.(listener);
    };
  }, [themeChoice, applyThemeToDOM]);

  /* ───────────────────────────────────────────────────────────── */
  /*  ACCESSIBILITY PREFERENCES                                    */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!canUseDOM() || !window.matchMedia) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const contrastQuery = window.matchMedia("(prefers-contrast: high)");

    const updateMotion = (matches: boolean) => {
      setPrefersReducedMotion(matches);
      document.documentElement.classList.toggle("reduce-motion", matches);
    };

    const updateContrast = (matches: boolean) => {
      setPrefersHighContrast(matches);
      document.documentElement.classList.toggle("high-contrast", matches);
    };

    updateMotion(motionQuery.matches);
    updateContrast(contrastQuery.matches);

    const motionListener = (event: MediaQueryListEvent) => updateMotion(event.matches);
    const contrastListener = (event: MediaQueryListEvent) => updateContrast(event.matches);

    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", motionListener);
      contrastQuery.addEventListener("change", contrastListener);
    } else {
      const legacyMotion = motionQuery as MediaQueryList & {
        addListener?: (callback: (event: MediaQueryListEvent) => void) => void;
        removeListener?: (callback: (event: MediaQueryListEvent) => void) => void;
      };

      const legacyContrast = contrastQuery as MediaQueryList & {
        addListener?: (callback: (event: MediaQueryListEvent) => void) => void;
        removeListener?: (callback: (event: MediaQueryListEvent) => void) => void;
      };

      legacyMotion.addListener?.(motionListener);
      legacyContrast.addListener?.(contrastListener);

      return () => {
        legacyMotion.removeListener?.(motionListener);
        legacyContrast.removeListener?.(contrastListener);
      };
    }

    return () => {
      motionQuery.removeEventListener("change", motionListener);
      contrastQuery.removeEventListener("change", contrastListener);
    };
  }, []);

  /* ───────────────────────────────────────────────────────────── */
  /*  ACTIONS                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const setThemeChoice = useCallback((choice: ThemeChoice) => {
    if (!VALID_CHOICES.has(choice)) return;
    writeThemeChoice(choice);
  }, []);

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeChoice(mode === "auto" ? "system" : mode);
    },
    [setThemeChoice]
  );

  const cycleTheme = useCallback(() => {
    const order: ThemeChoice[] = ["system", "light", "dark"];
    const currentIndex = order.indexOf(themeChoice);
    const nextIndex = (currentIndex + 1) % order.length;

    setThemeChoice(order[nextIndex]);
  }, [setThemeChoice, themeChoice]);

  const toggleTheme = useCallback(() => {
    setThemeChoice(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setThemeChoice]);

  /* ───────────────────────────────────────────────────────────── */
  /*  CONTEXT VALUE                                                */
  /* ───────────────────────────────────────────────────────────── */

  const themeMode: ThemeMode = themeChoice === "system" ? "auto" : themeChoice;

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeChoice,
      themeMode,
      resolvedTheme,
      theme: resolvedTheme,
      setThemeChoice,
      setThemeMode,
      cycleTheme,
      onThemeCycle: cycleTheme,
      toggleTheme,
      isTransitioning,
      isHydrated,
      prefersReducedMotion,
      prefersHighContrast,
    }),
    [
      themeChoice,
      themeMode,
      resolvedTheme,
      setThemeChoice,
      setThemeMode,
      cycleTheme,
      toggleTheme,
      isTransitioning,
      isHydrated,
      prefersReducedMotion,
      prefersHighContrast,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HOOKS                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme doit être utilisé dans un <ThemeProvider>.");
  }

  return context;
}

export function useResolvedTheme(): ResolvedTheme {
  return useTheme().resolvedTheme;
}

export function useThemeMode(): ThemeMode {
  return useTheme().themeMode;
}

export function useToggleTheme(): () => void {
  return useTheme().toggleTheme;
}

export function useCycleTheme(): () => void {
  return useTheme().cycleTheme;
}

export function useThemeTransition(): boolean {
  return useTheme().isTransitioning;
}

export function useAccessibilityPreferences() {
  const { prefersReducedMotion, prefersHighContrast } = useTheme();

  return {
    prefersReducedMotion,
    prefersHighContrast,
  };
}