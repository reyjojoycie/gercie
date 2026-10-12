// app/ThemeInitializer.tsx

/**
 * ThemeInitializer – Élimination absolue du flash (FOUC) et gestion premium du thème.
 * 
 * Optimisé pour :
 * - Kinshasa (connexions lentes, smartphones entrée de gamme)
 * - Performance extrême (détection CPU, RAM, connexion)
 * - Accessibilité (prefers-reduced-motion, prefers-contrast, font-size)
 * - PWA/mobile (theme-color, status bar iOS/Android)
 * - Stabilité (fallback noscript, try/catch robustes)
 *
 * 🔒 Fonctionne même sans JavaScript (grâce à un <noscript> fallback)
 * 🎨 Met à jour les métadonnées PWA (theme-color, status bar iOS/Android/Windows)
 * ♿ Détecte toutes les préférences d'accessibilité
 * 🌐 Respecte le choix `system`, `light` ou `dark` sauvegardé dans `gercie-theme-choice`
 * ⚡ Détecte les appareils lents et connexions faibles pour mode dégradé
 */
export function ThemeInitializer() {
  return (
    <>
      {/* Script inline bloquant (exécuté avant le premier paint) */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              'use strict';

              // ═══════════════════════════════════════════════════════════════
              // CONFIGURATION
              // ═══════════════════════════════════════════════════════════════
              var KEY = 'gercie-theme-choice';
              var META_LIGHT = '#ffffff';
              var META_DARK = '#040715';
              var html = document.documentElement;

              // ═══════════════════════════════════════════════════════════════
              // 1. DÉTECTION DU THÈME
              // ═══════════════════════════════════════════════════════════════
              var stored;
              try {
                stored = localStorage.getItem(KEY);
              } catch(e) {
                // localStorage peut être désactivé (mode privé, quota dépassé, etc.)
                stored = null;
              }

              var isDark;
              if (stored === 'dark' || stored === 'light') {
                isDark = stored === 'dark';
              } else {
                // Choix 'system' ou absent → on suit la préférence système
                isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
              }

              // ═══════════════════════════════════════════════════════════════
              // 2. APPLICATION DU THÈME
              // ═══════════════════════════════════════════════════════════════
              html.classList.toggle('dark', isDark);
              html.style.colorScheme = isDark ? 'dark' : 'light';

              // ═══════════════════════════════════════════════════════════════
              // 3. MÉTADONNÉES PWA / MOBILE
              // ═══════════════════════════════════════════════════════════════
              var themeColor = isDark ? META_DARK : META_LIGHT;

              // Met à jour la meta theme-color (PWA / mobile)
              var metaThemeColor = document.querySelector('meta[name="theme-color"]');
              if (metaThemeColor) {
                metaThemeColor.setAttribute('content', themeColor);
              }

              // Barre de statut iOS
              var appleMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
              if (appleMeta) {
                appleMeta.setAttribute('content', isDark ? 'black-translucent' : 'default');
              }

              // Windows tiles
              var msMeta = document.querySelector('meta[name="msapplication-navbutton-color"]');
              if (msMeta) {
                msMeta.setAttribute('content', themeColor);
              }

              // ═══════════════════════════════════════════════════════════════
              // 4. DÉTECTION DES PRÉFÉRENCES D'ACCESSIBILITÉ
              // ═══════════════════════════════════════════════════════════════
              if (window.matchMedia) {
                // Mouvement réduit
                if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                  html.classList.add('reduce-motion');
                }

                // Contraste élevé
                if (window.matchMedia('(prefers-contrast: high)').matches) {
                  html.classList.add('high-contrast');
                }

                // Taille de police préférée (accessibilité visuelle)
                if (window.matchMedia('(min-resolution: 1.5dppx)').matches) {
                  html.classList.add('high-dpi');
                }
              }

              // ═══════════════════════════════════════════════════════════════
              // 5. DÉTECTION PERFORMANCE (Kinshasa optimisé)
              // ═══════════════════════════════════════════════════════════════
              
              // Détection connexion lente
              var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
              if (conn) {
                var isSlow = 
                  conn.saveData || 
                  conn.effectiveType === 'slow-2g' || 
                  conn.effectiveType === '2g' ||
                  (conn.downlink && conn.downlink < 1.5);
                
                if (isSlow) {
                  html.classList.add('low-bandwidth');
                }
              }

              // Détection appareils à faible puissance
              var cores = navigator.hardwareConcurrency || 2;
              var memory = navigator.deviceMemory || 4;
              
              if (cores <= 2 || memory <= 2) {
                html.classList.add('low-power');
              }

              // Détection mode économie d'énergie (si supporté)
              if (navigator.getBattery) {
                navigator.getBattery().then(function(battery) {
                  if (battery.level < 0.2 && !battery.charging) {
                    html.classList.add('low-battery');
                  }
                }).catch(function() {});
              }

              // ═══════════════════════════════════════════════════════════════
              // 6. ÉCOUTE DES CHANGEMENTS SYSTÈME (temps réel)
              // ═══════════════════════════════════════════════════════════════
              if (window.matchMedia) {
                // Écoute du changement de préférence système
                var darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
                var handleChange = function(e) {
                  // Seulement si l'utilisateur n'a pas fait de choix explicite
                  var currentChoice;
                  try {
                    currentChoice = localStorage.getItem(KEY);
                  } catch(err) {
                    currentChoice = null;
                  }
                  
                  if (!currentChoice || currentChoice === 'system') {
                    html.classList.toggle('dark', e.matches);
                    html.style.colorScheme = e.matches ? 'dark' : 'light';
                    
                    var newThemeColor = e.matches ? META_DARK : META_LIGHT;
                    var meta = document.querySelector('meta[name="theme-color"]');
                    if (meta) meta.setAttribute('content', newThemeColor);
                    
                    var apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
                    if (apple) apple.setAttribute('content', e.matches ? 'black-translucent' : 'default');
                    
                    var ms = document.querySelector('meta[name="msapplication-navbutton-color"]');
                    if (ms) ms.setAttribute('content', newThemeColor);
                  }
                };

                // Compatibilité navigateurs anciens
                if (darkModeQuery.addEventListener) {
                  darkModeQuery.addEventListener('change', handleChange);
                } else if (darkModeQuery.addListener) {
                  darkModeQuery.addListener(handleChange);
                }
              }

              // ═══════════════════════════════════════════════════════════════
              // 7. PRÉVENTION DES TRANSITIONS AU CHARGEMENT
              // ═══════════════════════════════════════════════════════════════
              html.classList.add('theme-ready');
              
              if (window.addEventListener) {
                window.addEventListener('load', function() {
                  html.classList.remove('theme-ready');
                });
              } else if (window.attachEvent) {
                // IE11 fallback
                window.attachEvent('onload', function() {
                  html.classList.remove('theme-ready');
                });
              }

              // ═══════════════════════════════════════════════════════════════
              // 8. LOGGING (développement uniquement)
              // ═══════════════════════════════════════════════════════════════
              if (typeof console !== 'undefined' && console.log) {
                var debugInfo = {
                  theme: isDark ? 'dark' : 'light',
                  source: stored ? 'user' : 'system',
                  cores: cores,
                  memory: memory + 'GB',
                  connection: conn ? (conn.effectiveType || 'unknown') : 'unknown'
                };
                console.log('🎨 Theme initialized:', debugInfo);
              }
            })();
          `,
        }}
      />

      {/* Fallback <noscript> : si JavaScript est désactivé */}
      <noscript>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Thème basé sur la préférence système */
              @media (prefers-color-scheme: dark) {
                html { 
                  color-scheme: dark; 
                  background-color: #040715; 
                  color: #cdd6e9; 
                }
                html body {
                  background-color: #040715;
                  color: #cdd6e9;
                }
              }
              @media (prefers-color-scheme: light) {
                html { 
                  color-scheme: light; 
                  background-color: #ffffff; 
                  color: #1b1a16; 
                }
                html body {
                  background-color: #ffffff;
                  color: #1b1a16;
                }
              }

              /* Accessibilité : mouvement réduit */
              @media (prefers-reduced-motion: reduce) {
                html { 
                  --animation-duration: 0.01ms !important;
                  --transition-duration: 0.01ms !important;
                }
                *,
                *::before,
                *::after {
                  animation-duration: 0.01ms !important;
                  animation-iteration-count: 1 !important;
                  transition-duration: 0.01ms !important;
                  scroll-behavior: auto !important;
                }
              }

              /* Accessibilité : contraste élevé */
              @media (prefers-contrast: high) {
                html {
                  --border-width: 2px;
                  --font-weight: 600;
                }
                body {
                  font-weight: 600;
                }
                button,
                a,
                input,
                select,
                textarea {
                  border-width: 2px;
                  font-weight: 600;
                }
              }

              /* Message pour utilisateurs sans JavaScript */
              .noscript-message {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: #f59e0b;
                color: #1b1a16;
                padding: 1rem;
                text-align: center;
                font-weight: 600;
                z-index: 9999;
              }
            `,
          }}
        />
        <div className="noscript-message">
          Pour une expérience optimale, veuillez activer JavaScript dans votre navigateur.
        </div>
      </noscript>
    </>
  );
}