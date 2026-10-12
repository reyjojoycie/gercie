// lib/email/templates/welcome.tsx
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Img,
  Heading,
  Text,
  Link,
  Hr,
  Row,
  Column,
} from '@react-email/components'

interface WelcomeEmailProps {
  username?: string
  confirmationUrl?: string
}

export function WelcomeEmail({
  username = 'Client',
  confirmationUrl = 'https://gercie.com',
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Bienvenue sur Gercie – Votre compte est prêt !</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://gercie.com/logo.png"
              alt="Gercie"
              width="120"
              height="auto"
              style={logo}
            />
          </Section>

          <Section style={content}>
            <Heading style={heading}>Bienvenue, {username} !</Heading>
            <Text style={paragraph}>
              Nous sommes ravis de vous accueillir sur Gercie, la marketplace
              universelle de la RDC. Votre compte a été créé avec succès.
            </Text>

            <Text style={paragraph}>
              Pour commencer à explorer nos produits et profiter de tous les
              avantages, confirmez votre adresse email en cliquant sur le
              bouton ci‑dessous.
            </Text>

            <Section style={buttonContainer}>
              <Link href={confirmationUrl} style={button}>
                Confirmer mon email
              </Link>
            </Section>

            <Text style={paragraph}>
              Si le bouton ne fonctionne pas, copiez et collez ce lien dans
              votre navigateur :{' '}
              <Link href={confirmationUrl} style={link}>
                {confirmationUrl}
              </Link>
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Row>
              <Column align="center">
                <Text style={footerText}>
                  © {new Date().getFullYear()} Gercie. Tous droits réservés.
                </Text>
                <Text style={footerText}>
                  Kinshasa, RDC –{' '}
                  <Link href="https://gercie.com" style={footerLink}>
                    gercie.com
                  </Link>
                </Text>
              </Column>
            </Row>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// Styles inline pour compatibilité email
const main = {
  backgroundColor: '#f9f9f9',
  fontFamily: 'Arial, sans-serif',
}

const container = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  overflow: 'hidden',
  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
}

const header = {
  backgroundColor: '#1a1a2e',
  padding: '24px',
  textAlign: 'center' as const,
}

const logo = {
  margin: '0 auto',
}

const content = {
  padding: '32px 24px',
}

const heading = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#1a1a2e',
  marginBottom: '16px',
}

const paragraph = {
  fontSize: '16px',
  color: '#333',
  lineHeight: '1.6',
  marginBottom: '12px',
}

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '24px',
  marginBottom: '24px',
}

const button = {
  display: 'inline-block',
  backgroundColor: '#d4af37',
  color: '#1a1a2e',
  fontWeight: 'bold',
  padding: '12px 32px',
  borderRadius: '8px',
  textDecoration: 'none',
  fontSize: '16px',
}

const link = {
  color: '#d4af37',
  textDecoration: 'underline',
}

const hr = {
  borderColor: '#e5e7eb',
  margin: '0',
}

const footer = {
  padding: '24px',
  backgroundColor: '#f9f9f9',
}

const footerText = {
  fontSize: '12px',
  color: '#6b7280',
  margin: '4px 0',
}

const footerLink = {
  color: '#d4af37',
  textDecoration: 'none',
}