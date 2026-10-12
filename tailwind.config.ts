// tailwind.config.ts – Configuration Tailwind Ultra‑Premium pour Gercie
// Version enrichie : +30 améliorations pour une marketplace élégante, performante et universelle
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
    './contexts/**/*.{js,ts,jsx,tsx,mdx}',
    './hooks/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ============================================================
      // PALETTE DE COULEURS – LUXE ABSOLU (16 familles, 176 teintes)
      // ============================================================
      colors: {
        // Marque – Bleu saphir profond
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
        // Accent – Vert jade royal
        accent: {
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
        // Chaleur – Or ambre royal
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
        // Exclusivité – Violet aubergine royale
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
        // Or pur – Métal précieux
        gold: {
          50: '#fdf9ed',
          100: '#faf0d7',
          200: '#f5e0af',
          300: '#efcf7e',
          400: '#e8be4c',
          500: '#dfad1f',
          600: '#c99a14',
          700: '#a87d0e',
          800: '#8b650a',
          900: '#6d4e08',
          950: '#4a3405',
        },
        // Bourgogne – Rouge profond
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
        // Minuit – Bleu nuit (dark mode)
        midnight: {
          50: '#e6ebf4',
          100: '#cdd6e9',
          200: '#9aa7d2',
          300: '#6b7db8',
          400: '#455a9e',
          500: '#2c3e84',
          600: '#1f2b6b',
          700: '#151e52',
          800: '#0d1338',
          900: '#080c24',
          950: '#040715',
        },
        // Champagne – Beige doré doux
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
        // Neutres – Gris chauds
        neutral: {
          50: '#fafaf9',
          100: '#f4f3f0',
          200: '#e7e5e0',
          300: '#d1cec7',
          400: '#a8a49b',
          500: '#7d7970',
          600: '#5c5850',
          700: '#41403a',
          800: '#2b2a25',
          900: '#1b1a16',
          950: '#11100e',
        },
        // Danger – Rouge vif
        danger: {
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
        // Succès – Vert émeraude
        success: {
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
        // Avertissement – Ambre chaud
        warning: {
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
        // Info – Cyan
        info: {
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
        // Rose Gold – Rose luxueux (nouveau)
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
        // Teal – Bleu canard profond (nouveau)
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
        // Copper – Cuivre métallique (nouveau)
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
        // Silver – Argent moderne (nouveau)
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
        // Blush – Rose poudré (nouveau)
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
        // Sage – Vert sauge doux (nouveau)
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
        // Coral – Corail chaleureux (nouveau)
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
        // Sky – Bleu ciel clair (nouveau)
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
        // Plum – Prune mystérieuse (nouveau)
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
      },

      // ============================================================
      // TYPOGRAPHIE – Élégance, lisibilité & lisibilité dynamique
      // ============================================================
      fontFamily: {
        sans: ['Outfit', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        heading: ['Plus Jakarta Sans', 'Outfit', 'sans-serif'],
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

      // ============================================================
      // ESPACEMENTS – Nouveaux paliers harmonieux
      // ============================================================
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
        '144': '36rem',
        '160': '40rem',
        '192': '48rem',
      },

      // ============================================================
      // BORDURES ET ARRONDIS – Géométrie douce & organique
      // ============================================================
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
        '6xl': '3rem',
      },
      borderWidth: {
        '3': '3px',
      },

      // ============================================================
      // OMBRES – Lumières et profondeurs, 23 variantes
      // ============================================================
      boxShadow: {
        'soft': '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        'medium': '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
        'strong': '0 10px 40px -10px rgba(0, 0, 0, 0.15), 0 20px 15px -15px rgba(0, 0, 0, 0.08)',
        'card': '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 10px 30px -10px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 50px -12px rgba(0, 0, 0, 0.25)',
        'glow-brand': '0 0 30px rgba(71, 102, 247, 0.35)',
        'glow-accent': '0 0 30px rgba(24, 199, 138, 0.35)',
        'glow-warm': '0 0 30px rgba(246, 207, 42, 0.35)',
        'glow-luxury': '0 0 30px rgba(139, 92, 246, 0.35)',
        'glow-gold': '0 0 30px rgba(223, 173, 31, 0.4)',
        'inner-glow': 'inset 0 2px 4px 0 rgba(71, 102, 247, 0.06)',
        'glow-rosegold': '0 0 30px rgba(255, 92, 126, 0.4)',
        'glow-copper': '0 0 30px rgba(227, 125, 50, 0.4)',
        'glow-teal': '0 0 30px rgba(27, 191, 161, 0.4)',
        'glow-plum': '0 0 30px rgba(163, 68, 224, 0.35)',
        'dark-card': '0 4px 20px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(255, 255, 255, 0.05)',
        'dark-xl': '0 15px 40px rgba(0, 0, 0, 0.5), 0 5px 15px rgba(0, 0, 0, 0.3)',
      },

      // ============================================================
      // ANIMATIONS – 25 nouvelles clés et classes
      // ============================================================
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'slide-in-left': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'bounce-slow': {
          '0%, 100%': { transform: 'translateY(-5%)', animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)' },
          '50%': { transform: 'translateY(0)', animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)' },
        },
        'spin-slow': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(223, 173, 31, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(223, 173, 31, 0.6)' },
        },
        'fade-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'fade-in-right': {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-in-down': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'zoom-in': {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'flip': {
          '0%': { transform: 'rotateY(90deg)' },
          '100%': { transform: 'rotateY(0deg)' },
        },
        'gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'rotate-3d': {
          '0%': { transform: 'perspective(1000px) rotateY(0deg)' },
          '100%': { transform: 'perspective(1000px) rotateY(360deg)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.5s ease-out',
        'fade-in-up': 'fade-in-up 0.6s ease-out',
        'fade-in-down': 'fade-in-down 0.4s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
        'slide-in-left': 'slide-in-left 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-slow': 'bounce-slow 2s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'fade-in-left': 'fade-in-left 0.5s ease-out',
        'fade-in-right': 'fade-in-right 0.5s ease-out',
        'slide-in-up': 'slide-in-up 0.4s ease-out',
        'slide-in-down': 'slide-in-down 0.4s ease-out',
        'zoom-in': 'zoom-in 0.3s ease-out',
        'flip': 'flip 0.6s ease-out',
        'gradient-shift': 'gradient-shift 3s ease infinite',
        'rotate-3d': 'rotate-3d 4s linear infinite',
      },

      // ============================================================
      // GRADIENTS – 22 dégradés pour toutes les humeurs
      // ============================================================
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #4766f7 0%, #1d3ab8 100%)',
        'gradient-accent': 'linear-gradient(135deg, #18c78a 0%, #0c7f5e 100%)',
        'gradient-warm': 'linear-gradient(135deg, #f6cf2a 0%, #a8860a 100%)',
        'gradient-luxury': 'linear-gradient(135deg, #8b5cf6 0%, #5329a8 100%)',
        'gradient-premium': 'linear-gradient(135deg, #1d3ab8 0%, #6d39d2 100%)',
        'gradient-soft': 'linear-gradient(180deg, rgba(71,102,247,0.05) 0%, transparent 100%)',
        'gradient-radial': 'radial-gradient(circle, var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg, var(--tw-gradient-stops))',
        'gradient-gold': 'linear-gradient(135deg, #e8be4c 0%, #c99a14 50%, #8b650a 100%)',
        'gradient-midnight': 'linear-gradient(to bottom, #0D1338 0%, #040715 100%)',
        'glass': 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
        'glass-dark': 'linear-gradient(135deg, rgba(0,0,0,0.2), rgba(0,0,0,0.05))',
        'gradient-rosegold': 'linear-gradient(135deg, #ff5c7e 0%, #b32242 100%)',
        'gradient-copper': 'linear-gradient(135deg, #e37d32 0%, #9b4f17 100%)',
        'gradient-teal': 'linear-gradient(135deg, #1bbfa1 0%, #0b7d6c 100%)',
        'gradient-sky': 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
        'gradient-plum': 'linear-gradient(135deg, #a344e0 0%, #601a9e 100%)',
        'gradient-sunset': 'linear-gradient(135deg, #ff5c7e 0%, #f6cf2a 100%)',
        'gradient-ocean': 'linear-gradient(135deg, #0ea5e9 0%, #1bbfa1 100%)',
        'gradient-forest': 'linear-gradient(135deg, #6b9a5b 0%, #06382b 100%)',
      },

      // ============================================================
      // TRANSITION DURATIONS (pour micro-interactions)
      // ============================================================
      transitionDuration: {
        '2000': '2000ms',
        '3000': '3000ms',
        '4000': '4000ms',
      },

      // ============================================================
      // Z-INDEX (gestion avancée des superpositions)
      // ============================================================
      zIndex: {
        '60': '60',
        '70': '70',
        '80': '80',
        '90': '90',
        '100': '100',
      },

      // ============================================================
      // CONTAINER (centré par défaut avec padding responsive)
      // ============================================================
      container: {
        center: true,
        padding: {
          DEFAULT: '1rem',
          sm: '2rem',
          lg: '4rem',
          xl: '5rem',
        },
      },

      // ============================================================
      // BREAKPOINTS (inchangés mais on peut ajouter des alias)
      // ============================================================
      screens: {
        'xs': '475px',
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
        '2xl': '1536px',
      },
    },
  },
  plugins: [
    // Plugins recommandés pour une expérience professionnelle
    // require('@tailwindcss/forms')({ strategy: 'class' }), // formulaires élégants
    // require('@tailwindcss/typography'),                    // contenu éditorial
    // require('@tailwindcss/aspect-ratio'),                  // ratios d'images
    // require('tailwindcss-animate'),                        // animations avancées
    // require('@tailwindcss/container-queries'),             // responsive par composant
  ],
}

export default config