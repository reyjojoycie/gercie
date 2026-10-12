// lib/ai/imageEmbeddings.ts
import { pipeline } from '@xenova/transformers';
import { createHash } from 'crypto';

const CLIP_MODEL_NAME = 'Xenova/clip-vit-base-patch32';
export const CLIP_DIMENSION = 512;

let clipTextEmbedder: any = null;
let clipImageEmbedder: any = null;

async function getTextEmbedder() {
  if (!clipTextEmbedder) {
    console.info('[CLIP] Chargement du modèle texte...');
    clipTextEmbedder = await pipeline('feature-extraction', CLIP_MODEL_NAME, { quantized: true });
    console.info('[CLIP] Modèle texte chargé.');
  }
  return clipTextEmbedder;
}

async function getImageEmbedder() {
  if (!clipImageEmbedder) {
    console.info('[CLIP] Chargement du modèle image...');
    clipImageEmbedder = await pipeline('feature-extraction', CLIP_MODEL_NAME, { quantized: true });
    console.info('[CLIP] Modèle image chargé.');
  }
  return clipImageEmbedder;
}

const localCache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LOCAL_CACHE_MAX_SIZE = 1000;

function hashText(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}

function hashImageUrl(url: string): string {
  return createHash('sha256').update(`img:${url}`).digest('hex');
}

async function getCachedEmbedding(key: string): Promise<number[] | null> {
  const entry = localCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    localCache.delete(key);
    return null;
  }
  return entry.embedding;
}

async function setCachedEmbedding(key: string, embedding: number[]): Promise<void> {
  if (localCache.size >= LOCAL_CACHE_MAX_SIZE) {
    const oldest = [...localCache.entries()].reduce((a, b) =>
      a[1].timestamp < b[1].timestamp ? a : b
    );
    localCache.delete(oldest[0]);
  }
  localCache.set(key, { embedding, timestamp: Date.now() });
}

function normalizeEmbedding(embedding: number[]): number[] {
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm === 0) return embedding;
  return embedding.map(val => val / norm);
}

export async function generateClipTextEmbedding(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Texte vide');
  const cacheKey = hashText(trimmed);
  const cached = await getCachedEmbedding(cacheKey);
  if (cached) return cached;

  const embedder = await getTextEmbedder();
  const result = await embedder(trimmed, { pooling: 'mean', normalize: false });
  const embedding = normalizeEmbedding(Array.from(result.data) as number[]);
  await setCachedEmbedding(cacheKey, embedding);
  return embedding;
}

export async function generateClipImageEmbedding(imageUrl: string): Promise<number[]> {
  if (!imageUrl) throw new Error('URL image requise');
  const cacheKey = hashImageUrl(imageUrl);
  const cached = await getCachedEmbedding(cacheKey);
  if (cached) return cached;

  const embedder = await getImageEmbedder();
  const imageBuffer = await fetchImageWithRetry(imageUrl);
  const image = await loadImageFromBuffer(imageBuffer);
  
  const result = await embedder(image, { pooling: 'mean', normalize: false });
  const embedding = normalizeEmbedding(Array.from(result.data) as number[]);
  await setCachedEmbedding(cacheKey, embedding);
  return embedding;
}

export async function generateClipHybridEmbedding(
  text: string | null,
  imageUrl: string | null,
  textWeight: number = 0.5
): Promise<number[]> {
  if (!text && !imageUrl) throw new Error('Texte ou image requis');
  if (!text) return generateClipImageEmbedding(imageUrl!);
  if (!imageUrl) return generateClipTextEmbedding(text);

  const [textEmbedding, imageEmbedding] = await Promise.all([
    generateClipTextEmbedding(text),
    generateClipImageEmbedding(imageUrl),
  ]);

  const imageWeight = 1 - textWeight;
  const combined = textEmbedding.map((val, i) => val * textWeight + imageEmbedding[i] * imageWeight);
  return normalizeEmbedding(combined);
}

async function fetchImageWithRetry(url: string, maxRetries = 3, timeoutMs = 10000): Promise<ArrayBuffer> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.arrayBuffer();
    } catch (error: any) {
      lastError = error;
      if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw new Error(`Échec téléchargement: ${lastError?.message}`);
}

async function loadImageFromBuffer(buffer: ArrayBuffer): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([buffer]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Erreur chargement image')); };
    img.src = url;
  });
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}