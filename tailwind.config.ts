// tailwind.config.ts
// Gercie Market Place — Tailwind Compatibility & Design System Bridge
//
// IMPORTANT:
// With Tailwind v4, app/globals.css is the main source of truth.
// This file keeps compatibility with existing components and exposes
// semantic tokens, legacy palettes, shadows, animations and layout helpers.

import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',

  content: [
    './app/**/*.{js,jsx,ts,tsx,mdx}',
    './components/**/*.{js,jsx,ts,tsx,mdx}',
    './features/**/*.{js,jsx,ts,tsx,mdx}',
    './contexts/**/*.{js,jsx,ts,tsx,mdx}',
    './hooks/**/*.{js,jsx,ts,tsx,mdx}',
    './lib/**/*.{js,jsx,ts,tsx,mdx}',
    './pages/**/*.{js,jsx,ts,tsx,mdx}',
  ],

  theme: {
    extend: {
      /* ==================================================================
         COLORS
         ================================================================== */
      colors: {
        /* --------------------------------------------------------------
           SHADCN / PAGE COMPATIBILITY BRIDGE
           Used by existing files such as app/page.tsx:
           bg-background, text-foreground, text-muted-foreground, border-border
           -------------------------------------------------------------- */
        background: 'var(--color-bg-primary)',
        foreground: 'var(--color-text-primary)',
        border: 'var(--color-border-light)',
        'muted-foreground': 'var(--color-text-secondary)',

        card: 'var(--color-bg-card)',
        'card-foreground': 'var(--color-text-primary)',

        popover: 'var(--color-bg-elevated)',
        'popover-foreground': 'var(--color-text-primary)',

        /* --------------------------------------------------------------
           NEW SEMANTIC PREMIUM TOKENS
           Preferred for the rebuilt visual system.
           -------------------------------------------------------------- */
        canvas: 'var(--color-canvas)',
        surface: 'var(--color-surface)',
        raised: 'var(--color-raised)',
        muted: 'var(--color-muted)',

        overlay: 'var(--color-overlay)',
        'overlay-strong': 'var(--color-overlay-strong)',

        fg: 'var(--color-fg)',
        'fg-muted': 'var(--color-fg-muted)',
        'fg-subtle': 'var(--color-fg-subtle)',
        'fg-inverse': 'var(--color-fg-inverse)',

        line: 'var(--color-line)',
        'line-strong': 'var(--color-line-strong)',

        /* --------------------------------------------------------------
           MAIN ACCENT
           Light mode: deep sapphire blue
           Dark mode: refined champagne gold
           -------------------------------------------------------------- */
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
          soft: 'var(--color-accent-soft)',
          contrast: 'var(--color-accent-contrast)',

          // Legacy numeric accent kept for compatibility.
          // Existing components may still use accent-500, accent-600, etc.
          50: '#eefdf6',
          100: '#d4faeb',
          200: '#adf5d9',
          300: '#72edc0',
          400: '#3fe0a3',
          500: '#18c78a',
          600: '#0fa073',
          700: '#0c7f5e',
          800: '#0b664d',
          900: '#095440',
          950: '#06382b',
        },

        focus: 'var(--color-focus)',

        /* --------------------------------------------------------------
           STATE COLORS
           -------------------------------------------------------------- */
        success: {
          DEFAULT: 'var(--color-success)',
          soft: 'var(--color-success-soft)',

          50: '#f0fdf5',
          100: '#dcfce8',
          200: '#bbf7d1',
          300: '#86efad',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803c',
          800: '#166533',
          900: '#14532b',
          950: '#052e14',
        },

        warning: {
          DEFAULT: 'var(--color-warning)',
          soft: 'var(--color-warning-soft)',

          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },

        danger: {
          DEFAULT: 'var(--color-danger)',
          soft: 'var(--color-danger-soft)',

          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
          950: '#450a0a',
        },

        info: {
          DEFAULT: 'var(--color-info)',
          soft: 'var(--color-info-soft)',

          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
          950: '#083344',
        },

        /* --------------------------------------------------------------
           BRAND — DEEP SAPPHIRE
           Primary identity color for light mode.
           -------------------------------------------------------------- */
        brand: {
          50: '#eff3ff',
          100: '#dbe3fe',
          200: '#b9c8fd',
          300: '#8fa8fb',
          400: '#6b87f9',
          500: '#4766f7',
          600: '#2a4ae3',
          700: '#1d3ab8',
          800: '#172d94',
          900: '#132378',
          950: '#0f1b5c',
        },

        /* --------------------------------------------------------------
           WARM — AMBER ROYAL
           Used sparingly for promotional / attention elements.
           -------------------------------------------------------------- */
        warm: {
          50: '#fffdf2',
          100: '#fef9dc',
          200: '#fdf2ba',
          300: '#fbe98f',
          400: '#f9dd5e',
          500: '#f6cf2a',
          600: '#d4ac0d',
          700: '#a8860a',
          800: '#7e6509',
          900: '#5e4c08',
          950: '#3d3106',
        },

        /* --------------------------------------------------------------
           LUXURY — ROYAL AUBERGINE
           Used very sparingly, mainly for AI / special labels.
           -------------------------------------------------------------- */
        luxury: {
          50: '#faf5ff',
          100: '#efebff',
          200: '#ddd1fb',
          300: '#c2aef6',
          400: '#a583f0',
          500: '#8b5cf6',
          600: '#6d39d2',
          700: '#5329a8',
          800: '#3d1f80',
          900: '#291558',
          950: '#1a0c3d',
        },

        /* --------------------------------------------------------------
           GOLD — REFINED CHAMPAGNE IMPERIAL
           Primary identity color for dark mode.
           Not a flashy yellow gold. Controlled, premium, institutional.
           -------------------------------------------------------------- */
        gold: {
          50: '#fdf9ed',
          100: '#faf0d7',
          200: '#f2dfae',
          300: '#e9cd85',
          400: '#e4c57d',
          500: '#d7b56a',
          600: '#b8964f',
          700: '#96783d',
          800: '#6f5a2e',
          900: '#4d3e20',
          950: '#2b2312',
        },

        /* --------------------------------------------------------------
           BURGUNDY — DEEP RED
           Limited use: premium sale, urgency, editorial accents.
           -------------------------------------------------------------- */
        burgundy: {
          50: '#fdf2f4',
          100: '#fce7ea',
          200: '#f9d0d9',
          300: '#f2a5b6',
          400: '#e9728d',
          500: '#dc3f62',
          600: '#c42d54',
          700: '#a51f44',
          800: '#8b1a3a',
          900: '#721531',
          950: '#4a0c1f',
        },

        /* --------------------------------------------------------------
           MIDNIGHT — DEEP NIGHT BLUE SYSTEM
           Dark mode foundation. Not pure black.
           -------------------------------------------------------------- */
        midnight: {
          50: '#e8ebf2',
          100: '#d5dae6',
          200: '#b0bacd',
          300: '#8a97b3',
          400: '#67769a',
          500: '#4d5c80',
          600: '#34405e',
          700: '#222b42',
          800: '#151c2e',
          900: '#0f1524',
          950: '#070a14',
        },

        /* --------------------------------------------------------------
           CHAMPAGNE — SOFT GOLD BEIGE
           Secondary luxury warmth. Use with restraint.
           -------------------------------------------------------------- */
        champagne: {
          50: '#fefdfb',
          100: '#fdf9f2',
          200: '#faf2e2',
          300: '#f6e8cd',
          400: '#f2ddb8',
          500: '#edd0a2',
          600: '#e7c08b',
          700: '#dfad6e',
          800: '#d5994f',
          900: '#c48232',
          950: '#a5671e',
        },

        /* --------------------------------------------------------------
           NEUTRAL — WARM GREYS
           Balanced between premium warmth and professional neutrality.
           -------------------------------------------------------------- */
        neutral: {
          50: '#f8f8f5',
          100: '#f1f1ec',
          200: '#e6e4de',
          300: '#d5d2c9',
          400: '#9a9aa2',
          500: '#6f6f78',
          600: '#56565f',
          700: '#3f3f47',
          800: '#2a2a31',
          900: '#17171b',
          950: '#0d0d10',
        },

        /* --------------------------------------------------------------
           EXTRA LEGACY PALETTES
           Kept to avoid breaking existing components during migration.
           These should NOT become the main visual language.
           -------------------------------------------------------------- */
        rosegold: {
          50: '#fff5f7',
          100: '#ffe9ee',
          200: '#ffd3dd',
          300: '#ffb3c6',
          400: '#ff8aa5',
          500: '#ff5c7e',
          600: '#e03b5e',
          700: '#b32242',
          800: '#8a1a33',
          900: '#661226',
          950: '#3d0917',
        },

        teal: {
          50: '#f0fdfb',
          100: '#d2f9f2',
          200: '#a7f0e4',
          300: '#6fe7d2',
          400: '#3cd6bc',
          500: '#1bbfa1',
          600: '#0f9e86',
          700: '#0b7d6c',
          800: '#096356',
          900: '#074f45',
          950: '#04352e',
        },

        copper: {
          50: '#fdf6f2',
          100: '#fbecdf',
          200: '#f6d5ba',
          300: '#f0b98e',
          400: '#ea9b5d',
          500: '#e37d32',
          600: '#c2671e',
          700: '#9b4f17',
          800: '#7a3d13',
          900: '#5c2d0f',
          950: '#3d1c09',
        },

        silver: {
          50: '#f8f9fc',
          100: '#f1f3f9',
          200: '#e2e6f0',
          300: '#cbd2e3',
          400: '#a9b3cc',
          500: '#8794b0',
          600: '#6b7894',
          700: '#525e78',
          800: '#3e4860',
          900: '#2c3348',
          950: '#1a2030',
        },

        blush: {
          50: '#fff5f6',
          100: '#ffe9eb',
          200: '#ffd3d8',
          300: '#ffb3bd',
          400: '#ff8a9a',
          500: '#ff5c71',
          600: '#e03b52',
          700: '#b3223c',
          800: '#8a1a2d',
          900: '#661220',
          950: '#3d0911',
        },

        sage: {
          50: '#f7f9f6',
          100: '#eaf0e8',
          200: '#d4e2d0',
          300: '#b2caac',
          400: '#8db380',
          500: '#6b9a5b',
          600: '#527d45',
          700: '#3f6234',
          800: '#304d28',
          900: '#223b1c',
          950: '#152511',
        },

        coral: {
          50: '#fff5f2',
          100: '#ffe8df',
          200: '#ffcfba',
          300: '#ffac8a',
          400: '#ff8557',
          500: '#ff5e24',
          600: '#e0440d',
          700: '#b3340a',
          800: '#8a2708',
          900: '#661d06',
          950: '#3d1004',
        },

        sky: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },

        plum: {
          50: '#fcf5ff',
          100: '#f5e6ff',
          200: '#e9ccff',
          300: '#d6a3fa',
          400: '#be74f0',
          500: '#a344e0',
          600: '#7e22c2',
          700: '#601a9e',
          800: '#471378',
          900: '#300e55',
          950: '#1d0836',
        },

        // Legacy compatibility used in some AI / dark components.
        'gray-750': '#2d3748',
      },

      /* ==================================================================
         TYPOGRAPHY
         ================================================================== */
      fontFamily: {
        sans: [
          'Outfit',
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        body: [
          'Inter',
          'Outfit',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'sans-serif',
        ],
        heading: ['Plus Jakarta Sans', 'Outfit', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.375rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.75rem' }],
        '5xl': ['3rem', { lineHeight: '3.5rem' }],
        '6xl': ['3.75rem', { lineHeight: '4.25rem' }],
        '7xl': ['4.5rem', { lineHeight: '5rem' }],
        '8xl': ['6rem', { lineHeight: '6.5rem' }],
      },

      /* ==================================================================
         SPACING
         ================================================================== */
      spacing: {
        18: '4.5rem',
        88: '22rem',
        128: '32rem',
        144: '36rem',
        160: '40rem',
        192: '48rem',
      },

      /* ==================================================================
         BORDER RADIUS
         Controlled geometry. No excessive rounded shapes everywhere.
         ================================================================== */
      borderRadius: {
        control: 'var(--radius-control)',
        card: 'var(--radius-card)',
        panel: 'var(--radius-panel)',
        pill: 'var(--radius-pill)',

        '4xl': '2rem',
        '5xl': '2.5rem',
        '6xl': '3rem',
      },

      borderWidth: {
        3: '3px',
      },

      /* ==================================================================
         SHADOWS
         Premium depth. Subtle in light mode, controlled in dark mode.
         ================================================================== */
      boxShadow: {
        soft: 'var(--shadow-soft)',
        medium: 'var(--shadow-medium)',
        strong: 'var(--shadow-strong)',

        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        raised: 'var(--shadow-raised)',
        overlay: 'var(--shadow-overlay)',

        gold: 'var(--shadow-gold)',
        'glow-gold': 'var(--shadow-glow-gold)',
        'glow-brand': 'var(--shadow-glow-brand)',
        'glow-accent': 'var(--shadow-glow-accent)',
        'glow-luxury': 'var(--shadow-glow-luxury)',

        'dark-card': 'var(--shadow-dark-card)',
        'dark-xl': 'var(--shadow-dark-xl)',

        glass: 'var(--shadow-glass)',
        'glass-dark': 'var(--shadow-glass-dark)',

        xl: '0 20px 50px -12px rgba(0, 0, 0, 0.25)',
      },

      /* ==================================================================
         KEYFRAMES
         Sobres, rapides, professionnels.
         ================================================================== */
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },

        'fade-in-up': {
          from: {
            opacity: '0',
            transform: 'translateY(16px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },

        'fade-in-down': {
          from: {
            opacity: '0',
            transform: 'translateY(-16px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },

        'fade-in-left': {
          from: {
            opacity: '0',
            transform: 'translateX(-16px)',
          },
          to: {
            opacity: '1',
            transform: 'translateX(0)',
          },
        },

        'fade-in-right': {
          from: {
            opacity: '0',
            transform: 'translateX(16px)',
          },
          to: {
            opacity: '1',
            transform: 'translateX(0)',
          },
        },

        'slide-in-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },

        'slide-in-down': {
          from: { transform: 'translateY(-100%)' },
          to: { transform: 'translateY(0)' },
        },

        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },

        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },

        'scale-in': {
          from: {
            opacity: '0',
            transform: 'scale(0.96)',
          },
          to: {
            opacity: '1',
            transform: 'scale(1)',
          },
        },

        'zoom-in': {
          from: {
            opacity: '0',
            transform: 'scale(0.9)',
          },
          to: {
            opacity: '1',
            transform: 'scale(1)',
          },
        },

        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },

        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.75' },
        },

        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },

        'bounce-slow': {
          '0%, 100%': { transform: 'translateY(-4%)' },
          '50%': { transform: 'translateY(0)' },
        },

        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },

        'glow-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(215, 181, 106, 0.22)',
          },
          '50%': {
            boxShadow: '0 0 34px rgba(215, 181, 106, 0.38)',
          },
        },

        'gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },

        'background-pan': {
          from: { backgroundPosition: '0% center' },
          to: { backgroundPosition: '-200% center' },
        },
      },

      /* ==================================================================
         ANIMATIONS
         ================================================================== */
      animation: {
        'fade-in': 'fade-in 0.35s ease-out',
        'fade-in-up': 'fade-in-up 0.45s ease-out',
        'fade-in-down': 'fade-in-down 0.45s ease-out',
        'fade-in-left': 'fade-in-left 0.45s ease-out',
        'fade-in-right': 'fade-in-right 0.45s ease-out',

        'slide-in-up': 'slide-in-up 0.35s ease-out',
        'slide-in-down': 'slide-in-down 0.35s ease-out',
        'slide-in-left': 'slide-in-left 0.35s ease-out',
        'slide-in-right': 'slide-in-right 0.35s ease-out',

        'scale-in': 'scale-in 0.25s ease-out',
        'zoom-in': 'zoom-in 0.25s ease-out',

        shimmer: 'shimmer 1.8s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        float: 'float 3s ease-in-out infinite',
        'bounce-slow': 'bounce-slow 2s ease-in-out infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
        'glow-pulse': 'glow-pulse 2.4s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 3s ease infinite',
        'background-pan': 'background-pan 3s linear infinite',
      },

      /* ==================================================================
         TRANSITIONS
         ================================================================== */
      transitionDuration: {
        2000: '2000ms',
        3000: '3000ms',
        4000: '4000ms',
      },

      /* ==================================================================
         Z-INDEX
         ================================================================== */
      zIndex: {
        60: '60',
        70: '70',
        80: '80',
        90: '90',
        100: '100',
      },

      /* ==================================================================
         CONTAINER
         Premium breathing room.
         ================================================================== */
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '1.5rem',
          md: '2rem',
          lg: '2.5rem',
          xl: '3rem',
          '2xl': '4rem',
        },
      },

      /* ==================================================================
         BREAKPOINTS
         ================================================================== */
      screens: {
        xs: '475px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
    },
  },

  plugins: [],
}

export default config