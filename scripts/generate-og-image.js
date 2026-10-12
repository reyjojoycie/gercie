// scripts/generate-og-image.js
const sharp = require('sharp')
const path = require('path')

const WIDTH = 1200
const HEIGHT = 630
const OUTPUT = path.join(__dirname, '..', 'public', 'og-image.jpg')

async function main() {
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1d3ab8"/>
          <stop offset="100%" stop-color="#0f1b5c"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)"/>
      <text x="50%" y="40%" dominant-baseline="middle" text-anchor="middle"
            font-family="sans-serif" font-weight="bold" font-size="72" fill="#ffffff">
        Gercie
      </text>
      <text x="50%" y="58%" dominant-baseline="middle" text-anchor="middle"
            font-family="sans-serif" font-size="36" fill="#c9a962">
        Marketplace de luxe en RDC
      </text>
      <text x="50%" y="75%" dominant-baseline="middle" text-anchor="middle"
            font-family="sans-serif" font-size="24" fill="#f6cf2a">
        Achetez et vendez en toute confiance
      </text>
    </svg>
  `

  await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toFile(OUTPUT)
  console.log(`✅ Image générée : ${OUTPUT}`)
}

main().catch(console.error)