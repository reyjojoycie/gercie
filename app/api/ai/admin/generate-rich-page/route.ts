// app/api/ai/admin/generate-rich-page/route.ts
import { NextResponse } from 'next/server'
import { normalizeRichContent } from '@/features/admin/produits/lib/rich-content-utils'
import {
  createRichContentFromTemplate,
  getRichTemplateById,
} from '@/features/admin/produits/constants/rich-templates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function safeString(value: any, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value == null) return fallback
  return String(value)
}

function normalizeIncomingSpecs(specs: any) {
  if (!Array.isArray(specs)) return []

  return specs
    .map((spec: any) => ({
      label: safeString(spec?.label || spec?.key).trim(),
      value: safeString(spec?.value).trim(),
    }))
    .filter((spec) => spec.label || spec.value)
}

function buildPrompt(body: any) {
  const productName = safeString(body.productName, 'Produit')
  const category = safeString(body.category, 'Général')
  const description = safeString(body.description)
  const sourceUrl = safeString(body.sourceUrl)
  const templateId = safeString(body.templateId, 'generic')
  const specs = normalizeIncomingSpecs(body.specs)

  const specsText = specs.length
    ? specs.map((s) => `${s.label} : ${s.value}`).join('\n')
    : 'Aucune spec fournie.'

  return `
Tu es un expert e-commerce qui crée des pages produit premium.

Objectif :
Génère un contenu structuré JSON pour la fiche produit, inspiré du style des grandes marques (Apple, Samsung, Toyota), MAIS sans copier leurs textes exacts, leurs images, leur HTML ou leur design propriétaire.

Contraintes importantes :
- Ne copie pas directement une page web.
- Crée un modèle original.
- Utilise un ton premium, clair, commercial.
- Langue : français.
- Le JSON doit respecter exactement la structure demandée.
- Ne mets pas de markdown.
- Ne mets pas de commentaires JSON.
- Si une information manque, invente une formulation générique crédible, mais ne prétends pas avoir copié une source officielle.

Produit :
Nom : ${productName}
Catégorie : ${category}
Description existante : ${description || 'Non fournie'}
URL source éventuelle pour inspiration uniquement : ${sourceUrl || 'Non fournie'}
Template souhaité : ${templateId}

Specs existantes :
${specsText}

Structure JSON attendue :
{
  "enabled": true,
  "templateId": "${templateId}",
  "generatedBy": "ai",
  "hero": {
    "title": "string",
    "subtitle": "string",
    "description": "string",
    "image": null,
    "videoUrl": null,
    "ctaLabel": "string",
    "ctaAction": "scroll_specs" | "add_to_cart" | "none"
  },
  "sections": [
    {
      "id": "string",
      "type": "text_image",
      "title": "string",
      "text": "string",
      "image": null,
      "layout": "image_left" | "image_right" | "image_top" | "image_center"
    },
    {
      "id": "string",
      "type": "features_grid",
      "title": "string",
      "items": [
        {
          "title": "string",
          "description": "string",
          "icon": null
        }
      ]
    },
    {
      "id": "string",
      "type": "stats_row",
      "items": [
        {
          "value": "string",
          "label": "string"
        }
      ]
    }
  ],
  "highlights": [
    {
      "title": "string",
      "description": "string",
      "icon": null
    }
  ],
  "specs": [
    {
      "label": "string",
      "value": "string"
    }
  ],
  "galleries": [],
  "videos": [],
  "comparison": null,
  "finalCta": {
    "title": "string",
    "description": "string",
    "buttonLabel": "string"
  }
}

Génère uniquement le JSON.
`.trim()
}

async function callOpenAI(prompt: string) {
  const apiKey = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini'

  if (!apiKey) return null

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Tu réponds uniquement avec un JSON valide, sans markdown, conforme au schéma demandé.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.error?.message || 'Erreur OpenAI.')
  }

  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content

  if (!content) return null

  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  ROUTE                                                          */
/* ═══════════════════════════════════════════════════════════════ */

export async function POST(request: Request) {
  try {
    /*
      ⚠️ SÉCURITÉ ADMIN
      -----------------
      Cette route est destinée à l'admin.
      Si tes routes API ne sont pas déjà protégées par un middleware global,
      tu dois ajouter ici ta vérification admin existante.

      Exemple à adapter selon ton projet :
      const session = await getServerSession()
      if (!session?.user?.isAdmin) return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 })
    */

    const body = await request.json().catch(() => ({}))

    const productName = safeString(body.productName, 'Produit')
    const category = safeString(body.category, 'Général')
    const description = safeString(body.description)
    const sourceUrl = safeString(body.sourceUrl)
    const templateId = safeString(body.templateId, 'generic')
    const specs = normalizeIncomingSpecs(body.specs)
    const images = Array.isArray(body.images)
      ? body.images.filter(Boolean).map(String)
      : []
    const videoUrl =
      typeof body.videoUrl === 'string' && body.videoUrl.trim()
        ? body.videoUrl.trim()
        : null

    const template = getRichTemplateById(templateId)

    let generated = createRichContentFromTemplate(template.id, {
      productName,
      category,
      description,
      specs,
      images,
      videoUrl,
    })

    const aiResult = await callOpenAI(buildPrompt(body)).catch((error) => {
      console.error('generate-rich-page AI error:', error)
      return null
    })

    if (aiResult && typeof aiResult === 'object') {
      generated = normalizeRichContent(
        {
          ...generated,
          ...aiResult,
          sourceUrl: sourceUrl || null,
          templateId: template.id,
          generatedBy: 'ai',
          updatedAt: new Date().toISOString(),
        },
        generated
      )
    } else {
      generated = normalizeRichContent(
        {
          ...generated,
          sourceUrl: sourceUrl || null,
          templateId: template.id,
          generatedBy: 'template',
          updatedAt: new Date().toISOString(),
        },
        generated
      )
    }

    return NextResponse.json({
      data: generated,
      template: {
        id: template.id,
        label: template.label,
      },
    })
  } catch (error: any) {
    console.error('generate-rich-page route error:', error)

    return NextResponse.json(
      {
        error: error?.message || 'Impossible de générer la page riche.',
      },
      { status: 500 }
    )
  }
}