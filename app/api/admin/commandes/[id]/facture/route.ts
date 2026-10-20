// app/api/admin/commandes/[id]/facture/route.ts
import { createClient } from '@/lib/supabaseServer'
import { requireAdmin } from '@/lib/auth/adminGuard'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import logger from '@/lib/logger'
import { rateLimit, applyRateLimitHeaders } from '@/lib/rateLimit'
import PDFDocument from 'pdfkit'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'
  const { allowed, headers: rateLimitHeaders } = rateLimit({
    id: `admin-facture:${ip}`,
    maxRequests: 20,
    windowSeconds: 60,
  })
  if (!allowed) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: 'Trop de requêtes.' }, { status: 429 }),
      rateLimitHeaders
    )
  }

  try {
    await requireAdmin()
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Accès non autorisé' }, { status: err.status || 403 })
  }

  const parsedId = z.string().uuid().safeParse(id)
  if (!parsedId.success) {
    return NextResponse.json({ error: 'ID commande invalide' }, { status: 400 })
  }

  try {
    const supabase = await createClient(true)

    // Récupération de la commande avec les détails nécessaires
    const { data: commande, error: cmdError } = await supabase
      .from('commandes')
      .select(`
        id,
        numero,
        total,
        sous_total,
        frais_livraison,
        remise,
        code_promo,
        statut,
        date,
        type_livraison,
        adresse_livraison,
        acheteur_id,
        articles:commande_articles(
          quantite,
          prix_unitaire,
          produit:produits(nom)
        )
      `)
      .eq('id', parsedId.data)
      .single()

    if (cmdError || !commande) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    }

    // Récupération du profil acheteur
    const { data: acheteur } = await supabase
      .from('profiles')
      .select('nom, prenom, email, telephone')
      .eq('id', commande.acheteur_id)
      .single()

    // Génération du PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => {})

    // En-tête
    doc.fontSize(20).font('Helvetica-Bold').text('Gercie - Facture', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(10).font('Helvetica').text(`Commande N° ${commande.numero}`, { align: 'center' })
    doc.text(`Date : ${new Date(commande.date).toLocaleDateString('fr-FR')}`, { align: 'center' })
    doc.moveDown(1)

    // Informations client
    doc.fontSize(12).font('Helvetica-Bold').text('Client')
    doc.fontSize(10).font('Helvetica').text(`${acheteur?.prenom || ''} ${acheteur?.nom || ''}`)
    if (acheteur?.email) doc.text(`Email : ${acheteur.email}`)
    if (acheteur?.telephone) doc.text(`Tél : ${acheteur.telephone}`)
    doc.moveDown(1)

    // Adresse de livraison
    doc.fontSize(12).font('Helvetica-Bold').text('Livraison')
    doc.fontSize(10).font('Helvetica').text(commande.adresse_livraison || 'Point de retrait')
    doc.moveDown(1)

    // Tableau des articles
    const tableTop = doc.y + 10
    const col1 = 50
    const col2 = 300
    const col3 = 450

    doc.fontSize(10).font('Helvetica-Bold')
    doc.text('Article', col1, tableTop)
    doc.text('Qté', col2, tableTop)
    doc.text('Prix', col3, tableTop)
    doc.moveDown(0.5)

    doc.font('Helvetica')
    const articles = commande.articles || []
    articles.forEach((article: any) => {
      const y = doc.y
      doc.text(article.produit?.nom || 'Produit', col1, y)
      doc.text(String(article.quantite), col2, y)
      doc.text(`${article.prix_unitaire.toLocaleString()} FC`, col3, y)
      doc.moveDown(0.5)
    })

    // Ligne de total
    doc.moveDown(1)
    const lineY = doc.y
    doc.font('Helvetica-Bold')
    doc.text('Sous-total', col1, lineY)
    doc.text(`${commande.sous_total?.toLocaleString() || 0} FC`, col3, lineY)
    doc.moveDown(0.5)

    if (commande.remise > 0) {
      const remiseY = doc.y
      doc.text('Remise', col1, remiseY)
      doc.text(`-${commande.remise.toLocaleString()} FC`, col3, remiseY)
      doc.moveDown(0.5)
    }

    const fraisY = doc.y
    doc.text('Frais de livraison', col1, fraisY)
    doc.text(`${commande.frais_livraison?.toLocaleString() || 0} FC`, col3, fraisY)
    doc.moveDown(0.5)

    doc.fontSize(12)
    const totalY = doc.y
    doc.text('TOTAL', col1, totalY)
    doc.text(`${commande.total.toLocaleString()} FC`, col3, totalY)

    doc.end()

    // Attendre la fin du flux
    const pdfBuffer = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    })

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="facture_${commande.numero}.pdf"`,
      },
    })
  } catch (error: any) {
    logger.error(`Crash GET facture commande/${id}`, error)
    return NextResponse.json({ error: 'Erreur serveur interne' }, { status: 500 })
  }
}