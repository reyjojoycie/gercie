// app/opengraph-image.tsx
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const contentType = 'image/png'
export const size = { width: 1200, height: 630 }

// Chargement de la police Inter depuis Google Fonts (Edge compatible)
const interBold = fetch(
  new URL('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuGKYAZ9hiA.woff')
).then((res) => res.arrayBuffer())

const interRegular = fetch(
  new URL('https://fonts.gstatic.com/s/inter/v13/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff')
).then((res) => res.arrayBuffer())

export default async function Image() {
  const title = 'Gercie Market Place'
  const description = 'Gercie Market Place'
  const siteName = 'Gercie'

  const [boldFont, regularFont] = await Promise.all([interBold, interRegular])

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #1e3a8a 0%, #172554 40%, #0f172a 100%)',
          fontFamily: 'Inter, sans-serif',
          color: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Cercles décoratifs en arrière-plan */}
        <div style={{
          position: 'absolute',
          top: '-150px',
          right: '-150px',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(234,179,8,0.15) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-100px',
          left: '-100px',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%)',
        }} />

        {/* Motif de fond discret */}
        <svg style={{ position: 'absolute', width: '100%', height: '100%', opacity: 0.05 }}>
          <pattern id="diagonal" patternUnits="userSpaceOnUse" width="40" height="40">
            <line x1="0" y1="40" x2="40" y2="0" stroke="#c99a14" strokeWidth="1" />
          </pattern>
          <rect width="100%" height="100%" fill="url(#diagonal)" />
        </svg>

        {/* Conteneur principal */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 80px',
          backgroundColor: 'rgba(15,23,42,0.7)',
          borderRadius: '40px',
          border: '1px solid rgba(234,179,8,0.3)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(10px)',
          maxWidth: '900px',
          textAlign: 'center',
          zIndex: 10,
        }}>
          {/* Logo + Nom */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 30 }}>
            <div style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #c99a14, #f59e0b)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              fontWeight: 700,
              color: '#0f172a',
              marginRight: 16,
              boxShadow: '0 0 20px rgba(234,179,8,0.5)',
            }}>
              G
            </div>
            <span style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.02em' }}>
              <span style={{ color: '#ffffff' }}>{siteName}</span>
            </span>
          </div>

          {/* Titre principal */}
          <h1 style={{
            fontSize: 64,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.03em',
            background: 'linear-gradient(to right, #ffffff, #fcd34d)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 16,
          }}>
            {title}
          </h1>

          {/* Description */}
          <p style={{
            fontSize: 28,
            fontWeight: 400,
            lineHeight: 1.4,
            color: 'rgba(255,255,255,0.85)',
            marginBottom: 30,
            maxWidth: '700px',
          }}>
            {description}
          </p>

          {/* Badge simple */}
          <div style={{ display: 'flex', gap: 30, marginTop: 10 }}>
            <Badge text="gercie.com" />
          </div>
        </div>

        {/* Badge en bas à droite */}
        <div style={{
          position: 'absolute',
          bottom: 30,
          right: 30,
          background: 'rgba(15,23,42,0.8)',
          backdropFilter: 'blur(12px)',
          borderRadius: 30,
          padding: '8px 24px',
          border: '1px solid rgba(234,179,8,0.4)',
          color: '#fcd34d',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '0.05em',
        }}>
          GERCIE
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Inter', data: boldFont, weight: 700, style: 'normal' },
        { name: 'Inter', data: regularFont, weight: 400, style: 'normal' },
      ],
    }
  )
}

// Composant de badge réutilisable
function Badge({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderRadius: 30,
      padding: '8px 20px',
      border: '1px solid rgba(234,179,8,0.3)',
      fontSize: 20,
      fontWeight: 500,
      color: '#fcd34d',
    }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fcd34d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      {text}
    </div>
  )
}