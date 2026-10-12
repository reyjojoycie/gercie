// scripts/generate-screenshots.js
// ---------------------------------------------------------------------------
// Script utilitaire : génère les captures d'écran pour le manifest PWA
// Usage : node scripts/generate-screenshots.js
// ---------------------------------------------------------------------------

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Configuration - Assurez-vous que votre serveur local tourne sur ce port
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SCREENSHOTS_DIR = path.join(process.cwd(), 'public', 'screenshots');

const VIEWPORTS = [
  {
    name: 'home-desktop',
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    isMobile: false,
  },
  {
    name: 'home-mobile',
    width: 390, // Largeur standard iPhone
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
  },
];

async function generateScreenshots() {
  console.log('🚀 Lancement du générateur de captures...');
  
  // 1. Créer le dossier public/screenshots s'il n'existe pas
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    console.log(`📁 Dossier créé : ${SCREENSHOTS_DIR}`);
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox']
  });

  try {
    const page = await browser.newPage();

    for (const viewport of VIEWPORTS) {
      console.log(`📸 Capture « ${viewport.name} » (${viewport.width}x${viewport.height})...`);
      
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
      });

      // Navigation vers le site
      try {
        await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 15000 });
      } catch (e) {
        console.error(`❌ Impossible d'accéder à ${BASE_URL}. Votre serveur local est-il lancé ?`);
        break;
      }

      // Petite pause pour laisser les animations finir
      await new Promise(r => setTimeout(r, 2000));

      const filePath = path.join(SCREENSHOTS_DIR, `${viewport.name}.png`);
      
      await page.screenshot({
        path: filePath,
        type: 'png',
      });

      console.log(`✅ Sauvegardé : public/screenshots/${viewport.name}.png`);
    }
  } catch (error) {
    console.error('❌ Erreur pendant la capture:', error);
  } finally {
    await browser.close();
    console.log('✨ Mission terminée.');
  }
}

generateScreenshots();