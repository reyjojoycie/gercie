// app/admin/promo-banners/page.tsx
'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { CSSProperties, FormEvent, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Container } from '@/components/layout/Container';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import { ScrollToTop } from '@/components/ui/ScrollToTop';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import {
  Megaphone,
  Plus,
  Save,
  Trash2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Search,
  Copy,
  Download,
  Upload,
  X,
  Check,
  AlertTriangle,
  Info,
  Calendar,
  Link2,
  ExternalLink,
  Clock,
  ListChecks,
  RefreshCw,
  Wand2,
  GripVertical,
  Pencil,
  Sparkles,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════ */
/*  CONFIG                                                         */
/* ═══════════════════════════════════════════════════════════════ */

/**
 * Mets à true uniquement si ton API /api/admin/promo-banners gère la méthode DELETE.
 * Sinon, la suppression d'une bannière existante la désactive automatiquement.
 */
const API_SUPPORTS_DELETE = true;

const QUERY_KEY = ['admin-promo-banners'] as const;

const MESSAGE_TEMPLATES = [
  "Livraison offerte dès 50$ d'achat ! 🚀",
  '-20% sur toute la collection parfum ⏳',
  'Nouveautés disponibles dès maintenant ✨',
  'Offre limitée ce week-end seulement 🔥',
  'Paiement sécurisé + suivi en temps réel 📦',
  'Retours gratuits sous 7 jours ↩️',
];

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

interface PromoBanner {
  id: string;
  message: string;
  lien: string | null;
  ordre: number;
  actif: boolean;
  date_debut: string | null;
  date_fin: string | null;
}

type BannerStatus = 'active' | 'scheduled' | 'expired' | 'inactive';

type SortMode = 'ordre' | 'message' | 'debut' | 'fin' | 'statut';

type StatusFilter = 'all' | BannerStatus;

type PillTone = 'neutral' | 'gold' | 'blue' | 'red' | 'green' | 'amber';

interface ValidationReport {
  errors: string[];
  warnings: string[];
  score: number;
}

interface UtmParams {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  HELPERS                                                        */
/* ═══════════════════════════════════════════════════════════════ */

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function reindex(list: PromoBanner[]): PromoBanner[] {
  return list.map((item, index) => ({
    ...item,
    ordre: index + 1,
  }));
}

function isTempId(id: string): boolean {
  return id.startsWith('temp-');
}

function toApiPayload(item: PromoBanner) {
  return {
    id: item.id,
    message: item.message.trim(),
    lien: item.lien?.trim() || null,
    ordre: item.ordre,
    actif: item.actif,
    date_debut: item.date_debut || null,
    date_fin: item.date_fin || null,
  };
}

function toCreatePayload(item: PromoBanner) {
  const { id: _id, ...rest } = item;
  return {
    message: rest.message.trim(),
    lien: rest.lien?.trim() || null,
    ordre: rest.ordre,
    actif: rest.actif,
    date_debut: rest.date_debut || null,
    date_fin: rest.date_fin || null,
  };
}

function normalizeBanner(raw: unknown): PromoBanner {
  const data = (raw || {}) as Record<string, unknown>;

  return {
    id: String(data.id ?? ''),
    message: String(data.message ?? ''),
    lien: typeof data.lien === 'string' && data.lien.trim() ? data.lien : null,
    ordre: Number(data.ordre ?? 0) || 0,
    actif:
      typeof data.actif === 'boolean'
        ? data.actif
        : data.actif === undefined
          ? true
          : Boolean(data.actif),
    date_debut: typeof data.date_debut === 'string' ? data.date_debut : null,
    date_fin: typeof data.date_fin === 'string' ? data.date_fin : null,
  };
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleString('fr-FR');
}

function getStatus(item: PromoBanner, now: Date): BannerStatus {
  if (!item.actif) return 'inactive';

  const start = parseDate(item.date_debut);
  const end = parseDate(item.date_fin);

  if (start && start > now) return 'scheduled';
  if (end && end < now) return 'expired';

  return 'active';
}

function statusLabel(status: BannerStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'scheduled':
      return 'Programmée';
    case 'expired':
      return 'Expirée';
    case 'inactive':
    default:
      return 'Inactive';
  }
}

function statusTone(status: BannerStatus): string {
  switch (status) {
    case 'active':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
    case 'scheduled':
      return 'border-blue-500/30 bg-blue-500/15 text-blue-300';
    case 'expired':
      return 'border-red-500/30 bg-red-500/15 text-red-300';
    case 'inactive':
    default:
      return 'border-neutral-500/30 bg-neutral-500/15 text-neutral-300';
  }
}

function toInputDateTime(value?: string | null): string {
  if (!value) return '';
  const date = parseDate(value);
  if (!date) return '';

  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromInputDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isValidLink(value: string): boolean {
  const v = value.trim();
  if (!v) return true;

  if (
    v.startsWith('/') ||
    v.startsWith('//') ||
    v.startsWith('#') ||
    v.startsWith('mailto:') ||
    v.startsWith('tel:')
  ) {
    return true;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

function isExternalLink(value: string): boolean {
  const v = value.trim();
  return /^https?:\/\//i.test(v) || v.startsWith('//');
}

function validateBanner(item: PromoBanner | null): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!item) {
    return { errors: ['Aucune bannière à valider.'], warnings: [], score: 0 };
  }

  if (!item.message.trim()) {
    errors.push('Le message est obligatoire.');
  }

  if (item.message.length > 240) {
    warnings.push('Le message dépasse 240 caractères, il peut être tronqué sur mobile.');
  }

  if (item.message.length > 500) {
    errors.push('Le message ne doit pas dépasser 500 caractères.');
  }

  if (item.lien && !isValidLink(item.lien)) {
    errors.push('Le lien est invalide.');
  }

  if (item.lien && isExternalLink(item.lien)) {
    warnings.push('Lien externe détecté. Vérifie que c’est voulu.');
  }

  const start = parseDate(item.date_debut);
  const end = parseDate(item.date_fin);

  if (item.date_debut && !start) errors.push('Date de début invalide.');
  if (item.date_fin && !end) errors.push('Date de fin invalide.');

  if (start && end && start > end) {
    errors.push('La date de fin doit être postérieure à la date de début.');
  }

  const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 5);

  return { errors, warnings, score };
}

function buildUtmUrl(currentLink: string | null, utm: UtmParams): string | null {
  const href = currentLink?.trim();
  if (!href) return null;

  if (
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('#') ||
    href.startsWith('//')
  ) {
    return null;
  }

  try {
    const absolute = href.startsWith('http')
      ? href
      : `http://local${href.startsWith('/') ? '' : '/'}${href}`;

    const url = new URL(absolute);

    const entries: Array<[string, string]> = [
      ['utm_source', utm.utm_source],
      ['utm_medium', utm.utm_medium],
      ['utm_campaign', utm.utm_campaign],
      ['utm_term', utm.utm_term],
      ['utm_content', utm.utm_content],
    ];

    entries.forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    });

    return href.startsWith('http') ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function extractBannerArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;

    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.banners)) return obj.banners;
    if (Array.isArray(obj.rows)) return obj.rows;
    if (Array.isArray(obj.items)) return obj.items;
  }

  return [];
}

function parseImportedBanners(raw: unknown): PromoBanner[] {
  const array = extractBannerArray(raw);

  return array
    .map(normalizeBanner)
    .filter((item) => item.message.trim().length > 0)
    .map((item, index) => ({
      ...item,
      id: `temp-${generateId()}`,
      ordre: index + 1,
      actif: item.actif,
    }));
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI                                                       */
/* ═══════════════════════════════════════════════════════════════ */

function Pill({
  children,
  className,
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  tone?: PillTone;
}) {
  const tones: Record<PillTone, string> = {
    neutral: 'border-white/10 bg-white/5 text-neutral-300',
    gold: 'border-gold-400/30 bg-gold-500/10 text-gold-300',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    red: 'border-red-500/30 bg-red-500/10 text-red-300',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  };

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
        className || tones[tone]
      )}
    >
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: BannerStatus }) {
  return <Pill className={statusTone(status)}>{statusLabel(status)}</Pill>;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-2 block text-xs font-medium uppercase text-neutral-300">
      {children}
    </label>
  );
}

function BannerPreview({
  message,
  lien,
}: {
  message: string;
  lien: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gold-400/20 bg-gradient-to-r from-gold-400 via-amber-400 to-gold-500 px-4 py-3 text-midnight-900">
      <div className="flex items-center justify-center gap-2 text-sm font-semibold">
        <Sparkles size={16} aria-hidden="true" />
        <span className="line-clamp-2">{message || 'Aperçu du message promo...'}</span>
        {lien ? (
          <span className="underline underline-offset-2">En savoir plus</span>
        ) : null}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SORTABLE ROW                                                   */
/* ═══════════════════════════════════════════════════════════════ */

interface SortablePromoRowProps {
  item: PromoBanner;
  index: number;
  isLast: boolean;
  isSelected: boolean;
  canDrag: boolean;
  now: Date;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (item: PromoBanner) => void;
  onToggleActive: (item: PromoBanner) => void;
  onDuplicate: (item: PromoBanner) => void;
  onDelete: (item: PromoBanner) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
}

function SortablePromoRow({
  item,
  index,
  isLast,
  isSelected,
  canDrag,
  now,
  onSelect,
  onEdit,
  onToggleActive,
  onDuplicate,
  onDelete,
  onMove,
}: SortablePromoRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.65 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const status = getStatus(item, now);
  const report = validateBanner(item);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(
        'group relative flex flex-col gap-3 rounded-2xl border p-3 transition md:flex-row md:items-center',
        isSelected
          ? 'border-gold-500/60 bg-gold-500/5'
          : 'border-white/10 bg-black/30 hover:border-white/20',
        isDragging && 'shadow-2xl'
      )}
    >
      <div className="flex items-center gap-2 md:flex-col md:items-start">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(event) => onSelect(item.id, event.target.checked)}
          className="h-4 w-4 rounded border-neutral-600 bg-black text-gold-500 focus:ring-gold-500"
          aria-label={`Sélectionner ${item.message || 'bannière'}`}
        />

        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          disabled={!canDrag}
          className={cx(
            'rounded-lg p-1.5 text-neutral-400 transition',
            canDrag
              ? 'cursor-grab hover:bg-white/10 hover:text-white active:cursor-grabbing'
              : 'cursor-not-allowed opacity-30'
          )}
          aria-label="Glisser pour réordonner"
          title={canDrag ? 'Glisser pour réordonner' : 'Réordonnement désactivé avec filtres/tri'}
        >
          <GripVertical size={16} />
        </button>
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>
            <span className="font-mono">#{item.ordre}</span>
          </Pill>

          <StatusPill status={status} />

          {report.errors.length > 0 ? (
            <Pill className="border-red-500/30 bg-red-500/10 text-red-300">
              <AlertTriangle size={10} /> Erreurs
            </Pill>
          ) : null}

          {report.warnings.length > 0 ? (
            <Pill className="border-amber-500/30 bg-amber-500/10 text-amber-300">
              <Info size={10} /> Warnings
            </Pill>
          ) : null}

          {isTempId(item.id) ? (
            <Pill className="border-blue-500/30 bg-blue-500/10 text-blue-300">
              Nouvelle
            </Pill>
          ) : null}
        </div>

        <p className="line-clamp-2 text-sm font-medium text-white">
          {item.message || 'Sans message'}
        </p>

        <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400">
          {item.lien ? (
            <Pill tone="neutral">
              <Link2 size={10} />
              <span className="max-w-[180px] truncate">{item.lien}</span>
            </Pill>
          ) : (
            <Pill>Aucun lien</Pill>
          )}

          <Pill>
            <Calendar size={10} />
            Début: {formatDateTime(item.date_debut)}
          </Pill>

          <Pill>
            <Clock size={10} />
            Fin: {formatDateTime(item.date_fin)}
          </Pill>

          {item.actif ? (
            <Pill className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <Eye size={10} /> Visible
            </Pill>
          ) : (
            <Pill className="border-neutral-500/30 bg-neutral-500/10 text-neutral-300">
              <EyeOff size={10} /> Masquée
            </Pill>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 md:flex-col md:items-end">
        <Tooltip content="Éditer">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => onEdit(item)}
            aria-label="Éditer la bannière"
          >
            <Pencil size={15} />
          </Button>
        </Tooltip>

        <Tooltip content={item.actif ? 'Désactiver' : 'Activer'}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cx('h-9 w-9 p-0', item.actif ? 'text-emerald-300' : 'text-neutral-400')}
            onClick={() => onToggleActive(item)}
            aria-label={item.actif ? 'Désactiver la bannière' : 'Activer la bannière'}
          >
            {item.actif ? <Eye size={15} /> : <EyeOff size={15} />}
          </Button>
        </Tooltip>

        <Tooltip content="Dupliquer">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => onDuplicate(item)}
            aria-label="Dupliquer la bannière"
          >
            <Copy size={15} />
          </Button>
        </Tooltip>

        <Tooltip content="Monter">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => onMove(index, 'up')}
            disabled={!canDrag || index === 0}
            aria-label="Monter la bannière"
          >
            <ArrowUp size={15} />
          </Button>
        </Tooltip>

        <Tooltip content="Descendre">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0"
            onClick={() => onMove(index, 'down')}
            disabled={!canDrag || isLast}
            aria-label="Descendre la bannière"
          >
            <ArrowDown size={15} />
          </Button>
        </Tooltip>

        <Tooltip content={API_SUPPORTS_DELETE ? 'Supprimer' : 'Désactiver / archiver'}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-red-300 hover:bg-red-500/10 hover:text-red-200"
            onClick={() => onDelete(item)}
            aria-label="Supprimer ou désactiver la bannière"
          >
            <Trash2 size={15} />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN PAGE                                                      */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminPromoBannersPage() {
  const queryClient = useQueryClient();
  const toast = useToast() as any;

  const notify = useCallback(
    (type: 'success' | 'error' | 'info' | 'warning', message: string) => {
      try {
        if (typeof toast?.addToast === 'function') {
          toast.addToast({ type, message });
        } else if (typeof toast === 'function') {
          toast({ type, message });
        } else if (typeof toast?.toast === 'function') {
          toast.toast({ type, message });
        } else {
          console.log(`[${type}] ${message}`);
        }
      } catch {
        console.log(`[${type}] ${message}`);
      }
    },
    [toast]
  );

  /* ───────────────────────────────────────────────────────────── */
  /*  STATE                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const [items, setItems] = useState<PromoBanner[]>([]);
  const [deletedBanners, setDeletedBanners] = useState<PromoBanner[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortMode>('ordre');

  const [now, setNow] = useState(() => new Date());
  const [hasChanges, setHasChanges] = useState(false);
  const [autoSave, setAutoSave] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [draft, setDraft] = useState<PromoBanner | null>(null);

  const [utm, setUtm] = useState<UtmParams>({
    utm_source: 'promo-banner',
    utm_medium: 'site',
    utm_campaign: '',
    utm_term: '',
    utm_content: '',
  });

  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkEndDate, setBulkEndDate] = useState('');

  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<PromoBanner[] | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousBannersRef = useRef<PromoBanner[] | undefined>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /* ───────────────────────────────────────────────────────────── */
  /*  QUERY                                                        */
  /* ───────────────────────────────────────────────────────────── */

  const {
    data: banners,
    isLoading,
    isError,
    error: queryError,
    refetch,
    isFetching,
  } = useQuery<PromoBanner[]>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch('/api/admin/promo-banners', {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const text = await response.text().catch(() => '');
          throw new Error(text || `HTTP ${response.status}`);
        }

        const payload = await response.json();
        const rows = extractBannerArray(payload);

        const looksLikeKnownShape =
          Array.isArray(payload) ||
          Array.isArray((payload as { data?: unknown })?.data) ||
          Array.isArray((payload as { banners?: unknown })?.banners) ||
          Array.isArray((payload as { rows?: unknown })?.rows) ||
          Array.isArray((payload as { items?: unknown })?.items);

        if (rows.length === 0 && !looksLikeKnownShape) {
          console.warn('L’API promo-banners n’a pas retourné un tableau valide:', payload);
        }

        return rows
          .map(normalizeBanner)
          .filter((item) => Boolean(item.id))
          .sort((a, b) => a.ordre - b.ordre);
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    },
    staleTime: 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!banners) return;
    if (banners === previousBannersRef.current) return;

    previousBannersRef.current = banners;

    if (hasChanges) return;

    setItems([...banners].sort((a, b) => a.ordre - b.ordre));
    setSelectedIds(new Set());
    setDeletedBanners([]);
    setHasChanges(false);
  }, [banners, hasChanges]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  /* ───────────────────────────────────────────────────────────── */
  /*  DERIVED                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const stats = useMemo(() => {
    const base = {
      total: items.length,
      active: 0,
      scheduled: 0,
      expired: 0,
      inactive: 0,
      errors: 0,
    };

    items.forEach((item) => {
      const status = getStatus(item, now);

      if (status === 'active') base.active += 1;
      else if (status === 'scheduled') base.scheduled += 1;
      else if (status === 'expired') base.expired += 1;
      else base.inactive += 1;

      const report = validateBanner(item);
      if (report.errors.length > 0) base.errors += 1;
    });

    return base;
  }, [items, now]);

  const filteredItems = useMemo(() => {
    let result = [...items];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((item) =>
        [item.message, item.lien || '']
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((item) => getStatus(item, now) === statusFilter);
    }

    switch (sortBy) {
      case 'message':
        result.sort((a, b) => a.message.localeCompare(b.message));
        break;
      case 'debut':
        result.sort((a, b) => {
          const da = parseDate(a.date_debut)?.getTime() ?? Number.POSITIVE_INFINITY;
          const db = parseDate(b.date_debut)?.getTime() ?? Number.POSITIVE_INFINITY;
          return da - db;
        });
        break;
      case 'fin':
        result.sort((a, b) => {
          const da = parseDate(a.date_fin)?.getTime() ?? Number.POSITIVE_INFINITY;
          const db = parseDate(b.date_fin)?.getTime() ?? Number.POSITIVE_INFINITY;
          return da - db;
        });
        break;
      case 'statut':
        result.sort((a, b) => getStatus(a, now).localeCompare(getStatus(b, now)));
        break;
      case 'ordre':
      default:
        result.sort((a, b) => a.ordre - b.ordre);
        break;
    }

    return result;
  }, [items, search, statusFilter, sortBy, now]);

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds]
  );

  const allFilteredSelected = useMemo(
    () => filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id)),
    [filteredItems, selectedIds]
  );

  const canDrag = useMemo(
    () => sortBy === 'ordre' && !search.trim() && statusFilter === 'all',
    [sortBy, search, statusFilter]
  );

  const draftReport = useMemo(() => validateBanner(draft), [draft]);

  /* ───────────────────────────────────────────────────────────── */
  /*  MUTATIONS                                                    */
  /* ───────────────────────────────────────────────────────────── */

  const saveMutation = useMutation({
    mutationFn: async () => {
      const invalidItem = items.find((item) => !item.message.trim());
      if (invalidItem) {
        throw new Error('Certaines bannières n’ont pas de message.');
      }

      const invalidBanner = items.find((item) => validateBanner(item).errors.length > 0);
      if (invalidBanner) {
        const report = validateBanner(invalidBanner);
        throw new Error(report.errors[0] || 'Bannière invalide.');
      }

      const existingPayload = items
        .filter((item) => !isTempId(item.id) && item.id)
        .map(toApiPayload);

      const newPayload = items.filter((item) => isTempId(item.id)).map(toCreatePayload);

      let updated = 0;
      let created = 0;
      let deletedSuccess = 0;
      let deleteUnsupported = false;
      const deleteErrors: string[] = [];

      if (existingPayload.length > 0) {
        const response = await fetch('/api/admin/promo-banners', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(existingPayload),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(
            String(
              (errData as { error?: unknown })?.error ||
                response.statusText ||
                'Erreur lors de la mise à jour des bannières.'
            )
          );
        }

        updated = existingPayload.length;
      }

      if (newPayload.length > 0) {
        await Promise.all(
          newPayload.map(async (payload) => {
            const response = await fetch('/api/admin/promo-banners', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(
                String(
                  (errData as { error?: unknown })?.error ||
                    response.statusText ||
                    'Erreur lors de la création d’une bannière.'
                )
              );
            }
          })
        );

        created = newPayload.length;
      }

      if (API_SUPPORTS_DELETE && deletedBanners.length > 0) {
        const ids = deletedBanners.map((banner) => banner.id).filter(Boolean);

        for (const id of ids) {
          try {
            const response = await fetch('/api/admin/promo-banners', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            });

            if (response.ok) {
              deletedSuccess += 1;
            } else if (response.status === 405 || response.status === 404 || response.status === 501) {
              deleteUnsupported = true;
            } else {
              const errData = await response.json().catch(() => ({}));
              deleteErrors.push(
                String(
                  (errData as { error?: unknown })?.error ||
                    response.statusText ||
                    `Suppression impossible pour ${id}`
                )
              );
            }
          } catch (err: unknown) {
            deleteErrors.push(err instanceof Error ? err.message : String(err));
          }
        }
      }

      return {
        updated,
        created,
        deletedSuccess,
        deleteUnsupported,
        deleteErrors,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      setHasChanges(false);
      setDeletedBanners([]);
      setSelectedIds(new Set());

      const parts: string[] = [];
      if (result.updated > 0) parts.push(`${result.updated} mise(s) à jour`);
      if (result.created > 0) parts.push(`${result.created} création(s)`);
      if (result.deletedSuccess > 0) parts.push(`${result.deletedSuccess} suppression(s)`);

      notify(
        'success',
        parts.length > 0 ? `Enregistré : ${parts.join(', ')}.` : 'Rien à enregistrer.'
      );

      if (result.deleteUnsupported) {
        notify(
          'warning',
          'La suppression réelle n’est pas supportée par l’API. Les bannières ont été désactivées.'
        );
      }

      if (result.deleteErrors && result.deleteErrors.length > 0) {
        notify('error', `Erreurs de suppression : ${result.deleteErrors.join(' | ')}`);
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Erreur lors de l’enregistrement.';
      notify('error', message);
    },
  });

  /* ───────────────────────────────────────────────────────────── */
  /*  LOCAL MUTATION HELPERS                                       */
  /* ───────────────────────────────────────────────────────────── */

  const mutateItems = useCallback((updater: (prev: PromoBanner[]) => PromoBanner[]) => {
    setItems((prev) => reindex(updater(prev)));
    setHasChanges(true);
  }, []);

  const updateItem = useCallback(
    (id: string, field: keyof PromoBanner, value: unknown) => {
      mutateItems((prev) =>
        prev.map((item) => (item.id === id ? ({ ...item, [field]: value } as PromoBanner) : item))
      );
    },
    [mutateItems]
  );

  const moveItem = useCallback(
    (index: number, direction: 'up' | 'down') => {
      mutateItems((prev) => {
        const target = direction === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= prev.length) return prev;
        return arrayMove(prev, index, target);
      });
    },
    [mutateItems]
  );

  const toggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const ids = filteredItems.map((item) => item.id);
      const everySelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return everySelected ? new Set<string>() : new Set(ids);
    });
  }, [filteredItems]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const duplicateItem = useCallback(
    (item: PromoBanner) => {
      const copy: PromoBanner = {
        ...clone(item),
        id: `temp-${generateId()}`,
        message: `${item.message || 'Sans message'} (copie)`,
        actif: false,
        ordre: 0,
      };

      mutateItems((prev) => [...prev, copy]);
      notify('success', 'Bannière dupliquée localement. Pense à enregistrer.');
    },
    [mutateItems, notify]
  );

  const deleteItem = useCallback(
    (item: PromoBanner) => {
      if (isTempId(item.id)) {
        mutateItems((prev) => prev.filter((entry) => entry.id !== item.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        notify('success', 'Nouvelle bannière retirée.');
        return;
      }

      if (API_SUPPORTS_DELETE) {
        setDeletedBanners((prev) => [...prev, item]);
        mutateItems((prev) => prev.filter((entry) => entry.id !== item.id));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        notify('info', 'Bannière marquée pour suppression. Enregistre pour appliquer.');
        return;
      }

      updateItem(item.id, 'actif', false);
      notify(
        'info',
        'Suppression réelle non activée. La bannière a été désactivée. Active API_SUPPORTS_DELETE et ajoute DELETE dans l’API pour supprimer.'
      );
    },
    [mutateItems, notify, updateItem]
  );

  const toggleActiveItem = useCallback(
    (item: PromoBanner) => {
      updateItem(item.id, 'actif', !item.actif);
    },
    [updateItem]
  );

  const restoreDeletedBanner = useCallback(
    (id: string) => {
      const banner = deletedBanners.find((item) => item.id === id);
      if (!banner) return;

      setDeletedBanners((prev) => prev.filter((item) => item.id !== id));
      mutateItems((prev) => [...prev, banner]);
      notify('success', 'Suppression annulée.');
    },
    [deletedBanners, mutateItems, notify]
  );

  /* ───────────────────────────────────────────────────────────── */
  /*  BULK ACTIONS                                                 */
  /* ───────────────────────────────────────────────────────────── */

  const bulkSetActive = useCallback(
    (active: boolean) => {
      if (selectedIds.size === 0) return;

      mutateItems((prev) =>
        prev.map((item) => (selectedIds.has(item.id) ? { ...item, actif: active } : item))
      );

      notify('success', active ? 'Bannières activées.' : 'Bannières désactivées.');
    },
    [selectedIds, mutateItems, notify]
  );

  const bulkApplyDates = useCallback(() => {
    if (selectedIds.size === 0) return;

    const start = fromInputDateTime(bulkStartDate);
    const end = fromInputDateTime(bulkEndDate);

    if (!start && !end) {
      notify('info', 'Aucune date à appliquer.');
      return;
    }

    mutateItems((prev) =>
      prev.map((item) =>
        selectedIds.has(item.id)
          ? {
              ...item,
              date_debut: start ?? item.date_debut,
              date_fin: end ?? item.date_fin,
            }
          : item
      )
    );

    setBulkStartDate('');
    setBulkEndDate('');
    notify('success', 'Planning appliqué aux bannières sélectionnées.');
  }, [selectedIds, bulkStartDate, bulkEndDate, mutateItems, notify]);

  const bulkDuplicate = useCallback(() => {
    if (selectedIds.size === 0) return;

    const copies = items
      .filter((item) => selectedIds.has(item.id))
      .map((item) => ({
        ...clone(item),
        id: `temp-${generateId()}`,
        message: `${item.message || 'Sans message'} (copie)`,
        actif: false,
        ordre: 0,
      }));

    mutateItems((prev) => [...prev, ...copies]);
    clearSelection();
    notify('success', `${copies.length} bannière(s) dupliquée(s).`);
  }, [items, selectedIds, mutateItems, clearSelection, notify]);

  const bulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;

    const ids = Array.from(selectedIds);

    const tempIds = ids.filter(isTempId);
    const existingIds = ids.filter((id) => !isTempId(id));

    if (tempIds.length > 0) {
      mutateItems((prev) => prev.filter((item) => !tempIds.includes(item.id)));
    }

    if (existingIds.length > 0) {
      if (API_SUPPORTS_DELETE) {
        const toDelete = items.filter((item) => existingIds.includes(item.id));
        setDeletedBanners((prev) => [...prev, ...toDelete]);
        mutateItems((prev) => prev.filter((item) => !existingIds.includes(item.id)));
      } else {
        mutateItems((prev) =>
          prev.map((item) => (existingIds.includes(item.id) ? { ...item, actif: false } : item))
        );
      }
    }

    clearSelection();
    notify('success', 'Actions groupées appliquées.');
  }, [items, selectedIds, mutateItems, clearSelection, notify]);

  /* ───────────────────────────────────────────────────────────── */
  /*  DRAG & DROP                                                  */
  /* ───────────────────────────────────────────────────────────── */

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canDrag) return;

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);

      if (oldIndex < 0 || newIndex < 0) return;

      mutateItems((prev) => arrayMove(prev, oldIndex, newIndex));
      notify('success', 'Ordre mis à jour localement. Pense à enregistrer.');
    },
    [canDrag, items, mutateItems, notify]
  );

  /* ───────────────────────────────────────────────────────────── */
  /*  EDITOR                                                       */
  /* ───────────────────────────────────────────────────────────── */

  const openNewEditor = useCallback(() => {
    const newBanner: PromoBanner = {
      id: `temp-${generateId()}`,
      message: '',
      lien: null,
      ordre: items.length + 1,
      actif: true,
      date_debut: null,
      date_fin: null,
    };

    setDraft(newBanner);
    setIsNewDraft(true);
    setUtm({
      utm_source: 'promo-banner',
      utm_medium: 'site',
      utm_campaign: '',
      utm_term: '',
      utm_content: '',
    });
    setEditorOpen(true);
  }, [items.length]);

  const openEditEditor = useCallback((item: PromoBanner) => {
    setDraft(clone(item));
    setIsNewDraft(false);
    setUtm({
      utm_source: 'promo-banner',
      utm_medium: 'site',
      utm_campaign: '',
      utm_term: '',
      utm_content: '',
    });
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setDraft(null);
    setIsNewDraft(false);
  }, []);

  const patchDraft = useCallback((patch: Partial<PromoBanner>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const applyUtmToDraft = useCallback(() => {
    if (!draft) return;

    const nextLink = buildUtmUrl(draft.lien, utm);
    if (!nextLink) {
      notify('warning', 'Impossible d’appliquer les UTM sur ce type de lien.');
      return;
    }

    patchDraft({ lien: nextLink });
    notify('success', 'UTM appliqués au lien.');
  }, [draft, utm, patchDraft, notify]);

  const setDraftDatePreset = useCallback(
    (field: 'date_debut' | 'date_fin', preset: 'today' | 'tomorrow' | 'plus7' | 'plus30' | 'clear') => {
      if (!draft) return;

      const date = new Date();
      let value: string | null = null;

      switch (preset) {
        case 'today':
          value = date.toISOString();
          break;
        case 'tomorrow':
          date.setDate(date.getDate() + 1);
          value = date.toISOString();
          break;
        case 'plus7':
          date.setDate(date.getDate() + 7);
          value = date.toISOString();
          break;
        case 'plus30':
          date.setDate(date.getDate() + 30);
          value = date.toISOString();
          break;
        case 'clear':
          value = null;
          break;
      }

      patchDraft({ [field]: value } as Partial<PromoBanner>);
    },
    [draft, patchDraft]
  );

  const saveDraft = useCallback(async () => {
    if (!draft) return;

    const report = validateBanner(draft);
    if (report.errors.length > 0) {
      notify('error', report.errors[0]);
      return;
    }

    if (isNewDraft) {
      mutateItems((prev) => [...prev, draft]);
      notify('success', 'Bannière ajoutée localement. Pense à enregistrer.');
    } else {
      mutateItems((prev) => prev.map((item) => (item.id === draft.id ? draft : item)));
      notify('success', 'Bannière mise à jour localement. Pense à enregistrer.');
    }

    closeEditor();
  }, [draft, isNewDraft, mutateItems, notify, closeEditor]);

  /* ───────────────────────────────────────────────────────────── */
  /*  EXPORT / IMPORT                                              */
  /* ───────────────────────────────────────────────────────────── */

  const exportItems = useCallback(
    (scope: 'all' | 'filtered' | 'selected') => {
      const source =
        scope === 'all'
          ? items
          : scope === 'filtered'
            ? filteredItems
            : selectedItems;

      if (source.length === 0) {
        notify('info', 'Aucune bannière à exporter pour ce périmètre.');
        return;
      }

      downloadJson(
        {
          exported_at: new Date().toISOString(),
          scope,
          banners: source,
        },
        `promo-banners-${scope}-${Date.now()}.json`
      );

      notify('success', `Export ${scope} généré.`);
    },
    [items, filteredItems, selectedItems, notify]
  );

  const parseImport = useCallback(() => {
    try {
      const parsed = JSON.parse(importText);
      const parsedBanners = parseImportedBanners(parsed);

      if (parsedBanners.length === 0) {
        notify('warning', 'Aucune bannière valide trouvée dans le JSON.');
        setImportPreview(null);
        return;
      }

      setImportPreview(parsedBanners);
      notify('success', `${parsedBanners.length} bannière(s) prêtes à importer.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'JSON invalide.';
      notify('error', `Import impossible: ${message}`);
      setImportPreview(null);
    }
  }, [importText, notify]);

  const applyImport = useCallback(() => {
    if (!importPreview || importPreview.length === 0) return;

    mutateItems((prev) => [...prev, ...importPreview]);
    setImportText('');
    setImportPreview(null);
    notify('success', 'Import ajouté localement. Pense à enregistrer.');
  }, [importPreview, mutateItems, notify]);

  /* ───────────────────────────────────────────────────────────── */
  /*  SAVE ALL                                                     */
  /* ───────────────────────────────────────────────────────────── */

  const handleSaveAll = useCallback(() => {
    if (!hasChanges) {
      notify('info', 'Aucune modification à enregistrer.');
      return;
    }

    if (saveMutation.isPending) return;

    const invalid = items.find((item) => !item.message.trim());
    if (invalid) {
      notify('error', 'Toutes les bannières doivent avoir un message.');
      return;
    }

    saveMutation.mutate();
  }, [hasChanges, items, notify, saveMutation]);

  const saveAllRef = useRef(handleSaveAll);

  useEffect(() => {
    saveAllRef.current = handleSaveAll;
  }, [handleSaveAll]);

  /* ───────────────────────────────────────────────────────────── */
  /*  KEYBOARD / BEFOREUNLOAD / AUTOSAVE                           */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const handler = (event: globalThis.KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? event.metaKey : event.ctrlKey;

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (editorOpen) {
          void saveDraft();
        } else {
          handleSaveAll();
        }
      }

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key === 'Escape' && editorOpen) {
        closeEditor();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editorOpen, saveDraft, handleSaveAll, closeEditor]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (hasChanges) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  useEffect(() => {
    if (!autoSave || !hasChanges || saveMutation.isPending) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(() => {
      saveAllRef.current();
    }, 1800);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [autoSave, hasChanges, saveMutation.isPending]);

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER HELPERS                                               */
  /* ───────────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <Container className="py-12">
        <div className="flex justify-center">
          <Spinner size="lg" />
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-8">
      {/* HEADER */}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold font-serif">
            <Megaphone size={26} className="text-amber-500" />
            Bannières promotionnelles
          </h1>

          <p className="text-sm text-muted-foreground">
            Gérez les messages défilants, la planification, l’ordre, les liens UTM, l’import/export et les actions groupées.
          </p>

          <div className="flex flex-wrap gap-2">
            <Pill>
              <ListChecks size={10} />
              {stats.total} totale(s)
            </Pill>

            <Pill className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              <Eye size={10} />
              {stats.active} active(s)
            </Pill>

            <Pill className="border-blue-500/30 bg-blue-500/10 text-blue-300">
              <Calendar size={10} />
              {stats.scheduled} programmée(s)
            </Pill>

            <Pill className="border-red-500/30 bg-red-500/10 text-red-300">
              <Clock size={10} />
              {stats.expired} expirée(s)
            </Pill>

            <Pill className="border-neutral-500/30 bg-neutral-500/10 text-neutral-300">
              <EyeOff size={10} />
              {stats.inactive} inactive(s)
            </Pill>

            {stats.errors > 0 ? (
              <Pill className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                <AlertTriangle size={10} />
                {stats.errors} avec erreur(s)
              </Pill>
            ) : null}

            <Pill className={hasChanges ? 'border-gold-500/30 bg-gold-500/10 text-gold-300' : ''}>
              <Save size={10} />
              {hasChanges ? 'Modifications non enregistrées' : 'Synchronisé'}
            </Pill>

            {autoSave ? (
              <Pill className="border-blue-500/30 bg-blue-500/10 text-blue-300">
                <RefreshCw size={10} />
                Auto-save
              </Pill>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={16} className="mr-2" />
            Actualiser
          </Button>

          <Button
            type="button"
            variant={autoSave ? 'luxe' : 'outline'}
            onClick={() => setAutoSave((prev) => !prev)}
          >
            {autoSave ? <EyeOff size={16} className="mr-2" /> : <Eye size={16} className="mr-2" />}
            Auto-save {autoSave ? 'ON' : 'OFF'}
          </Button>

          <Button
            type="button"
            variant="luxe"
            onClick={handleSaveAll}
            disabled={saveMutation.isPending || !hasChanges}
          >
            {saveMutation.isPending ? (
              <RefreshCw size={16} className="mr-1 animate-spin" />
            ) : (
              <Save size={16} className="mr-1" />
            )}
            Enregistrer
          </Button>
        </div>
      </div>

      {/* ERROR */}
      {isError ? (
        <Card variant="glass" className="mb-6 border-red-500/30">
          <CardContent className="flex items-start gap-3 p-4 text-sm text-red-300">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">Erreur de chargement</p>
              <p className="mt-1 text-red-300/90">
                {queryError instanceof Error ? queryError.message : 'Impossible de charger les bannières.'}
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => refetch()}>
                Réessayer
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* TOOLBAR */}
      <Card variant="glass" className="mb-5">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Liste des bannières</h2>
              <p className="text-xs text-muted-foreground">
                Recherche, filtres, tri, drag & drop, sélection multiple et actions groupées.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="luxe" onClick={openNewEditor}>
                <Plus size={16} className="mr-1" />
                Ajouter une bannière
              </Button>

              <Button type="button" variant="outline" onClick={toggleSelectAll}>
                <Check size={16} className="mr-1" />
                {allFilteredSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
              </Button>

              <Button type="button" variant="outline" onClick={() => exportItems('filtered')}>
                <Download size={16} className="mr-1" />
                Export filtré
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="xl:col-span-2">
              <FieldLabel>Recherche</FieldLabel>
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
                />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Message, lien..."
                  aria-label="Rechercher une bannière"
                  className="h-10 w-full rounded-xl border border-white/10 bg-black pl-9 pr-3 text-white outline-none focus:ring-1 focus:ring-gold-400"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Statut</FieldLabel>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                aria-label="Filtrer par statut"
                className="h-10 w-full rounded-xl border border-white/10 bg-black px-3 text-white outline-none focus:ring-1 focus:ring-gold-400"
              >
                <option value="all">Tous</option>
                <option value="active">Actives</option>
                <option value="scheduled">Programmées</option>
                <option value="expired">Expirées</option>
                <option value="inactive">Inactives</option>
              </select>
            </div>

            <div>
              <FieldLabel>Tri</FieldLabel>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortMode)}
                aria-label="Trier les bannières"
                className="h-10 w-full rounded-xl border border-white/10 bg-black px-3 text-white outline-none focus:ring-1 focus:ring-gold-400"
              >
                <option value="ordre">Ordre manuel</option>
                <option value="message">Message A→Z</option>
                <option value="debut">Date de début</option>
                <option value="fin">Date de fin</option>
                <option value="statut">Statut</option>
              </select>
            </div>
          </div>

          {!canDrag ? (
            <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-200">
              <Info size={14} className="mt-0.5 shrink-0" />
              <p>Le drag & drop est désactivé quand une recherche, un filtre ou un tri autre que “Ordre manuel” est actif.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* PENDING DELETES */}
      {deletedBanners.length > 0 ? (
        <Card variant="glass" className="mb-5 border-red-500/30">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-red-200">
                <Trash2 size={16} />
                {deletedBanners.length} bannière(s) marquée(s) pour suppression
              </h3>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeletedBanners([]);
                  notify('info', 'Suppressions annulées localement.');
                }}
              >
                <X size={14} className="mr-1" />
                Tout annuler
              </Button>
            </div>

            <div className="space-y-2">
              {deletedBanners.map((banner) => (
                <div
                  key={banner.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-2 text-xs"
                >
                  <span className="min-w-0 truncate text-neutral-300">{banner.message || banner.id}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => restoreDeletedBanner(banner.id)}>
                    Restaurer
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* BULK BAR */}
      {selectedIds.size > 0 ? (
        <div className="sticky top-2 z-30 mb-5 space-y-3 rounded-2xl border border-gold-500/30 bg-black/85 p-4 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gold-200">
              <ListChecks size={16} />
              {selectedIds.size} sélectionnée(s)
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => bulkSetActive(true)}>
                <Eye size={14} className="mr-1" />
                Activer
              </Button>

              <Button type="button" variant="outline" size="sm" onClick={() => bulkSetActive(false)}>
                <EyeOff size={14} className="mr-1" />
                Désactiver
              </Button>

              <Button type="button" variant="outline" size="sm" onClick={bulkDuplicate}>
                <Copy size={14} className="mr-1" />
                Dupliquer
              </Button>

              <Button type="button" variant="outline" size="sm" onClick={() => exportItems('selected')}>
                <Download size={14} className="mr-1" />
                Exporter
              </Button>

              <Button type="button" variant="outline" size="sm" className="text-red-300" onClick={bulkDelete}>
                <Trash2 size={14} className="mr-1" />
                Supprimer / désactiver
              </Button>

              <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
                <X size={14} className="mr-1" />
                Clear
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <FieldLabel>Début groupé</FieldLabel>
              <Input
                type="datetime-local"
                value={bulkStartDate}
                onChange={(event) => setBulkStartDate(event.target.value)}
              />
            </div>

            <div>
              <FieldLabel>Fin groupée</FieldLabel>
              <Input
                type="datetime-local"
                value={bulkEndDate}
                onChange={(event) => setBulkEndDate(event.target.value)}
              />
            </div>

            <div className="flex items-end">
              <Button type="button" variant="luxe" className="h-10 w-full" onClick={bulkApplyDates}>
                <Calendar size={14} className="mr-2" />
                Appliquer dates
              </Button>
            </div>

            <div className="xl:col-span-2 flex items-end">
              <div className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-neutral-300">
                <p className="font-semibold text-white">Actions groupées</p>
                <p className="mt-1 text-neutral-400">
                  Les modifications sont locales. Clique sur “Enregistrer” ou active l’auto-save pour envoyer à l’API.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* LIST */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={filteredItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {filteredItems.map((item, index) => (
              <SortablePromoRow
                key={item.id}
                item={item}
                index={index}
                isLast={index === filteredItems.length - 1}
                isSelected={selectedIds.has(item.id)}
                canDrag={canDrag}
                now={now}
                onSelect={toggleSelect}
                onEdit={openEditEditor}
                onToggleActive={toggleActiveItem}
                onDuplicate={duplicateItem}
                onDelete={deleteItem}
                onMove={moveItem}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {filteredItems.length === 0 ? (
        <Card variant="glass" className="mt-5">
          <CardContent className="p-10 text-center">
            <p className="text-lg font-medium">Aucune bannière trouvée</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Modifie les filtres ou crée une nouvelle bannière promotionnelle.
            </p>
            <Button type="button" variant="luxe" className="mt-4" onClick={openNewEditor}>
              <Plus size={16} className="mr-1" />
              Créer une bannière
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* IMPORT / EXPORT */}
      <Card variant="glass" className="mt-6">
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Upload size={18} />
              Import / Export JSON
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Sauvegarde tes bannières ou importe-en depuis un JSON. L’import crée des bannières locales non enregistrées.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => exportItems('all')}>
              <Download size={14} className="mr-1" />
              Export tout
            </Button>

            <Button type="button" variant="outline" onClick={() => exportItems('filtered')}>
              <Download size={14} className="mr-1" />
              Export filtré
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => exportItems('selected')}
              disabled={selectedItems.length === 0}
            >
              <Download size={14} className="mr-1" />
              Export sélection
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const ok = await copyText(JSON.stringify(items, null, 2));
                notify(ok ? 'success' : 'error', ok ? 'JSON copié.' : 'Impossible de copier.');
              }}
            >
              <Copy size={14} className="mr-1" />
              Copier JSON
            </Button>
          </div>

          <div>
            <FieldLabel>Coller un JSON d’import</FieldLabel>
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder='[{ "message": "Livraison offerte", "lien": "/promotions", "actif": true }]'
              className="min-h-[160px] w-full resize-y rounded-xl border border-white/10 bg-black px-3 py-2 font-mono text-xs text-white outline-none focus:ring-1 focus:ring-gold-400"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="luxe" onClick={parseImport} disabled={!importText.trim()}>
              <Check size={14} className="mr-1" />
              Valider import
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={applyImport}
              disabled={!importPreview || importPreview.length === 0}
            >
              <Upload size={14} className="mr-1" />
              Importer {importPreview?.length || 0} bannière(s)
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setImportText('');
                setImportPreview(null);
              }}
            >
              <X size={14} className="mr-1" />
              Clear
            </Button>
          </div>

          {importPreview ? (
            <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs">
              <p className="font-semibold text-white">Aperçu import</p>
              <p className="mt-1 text-neutral-400">{importPreview.length} bannière(s) valide(s).</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* EDITOR MODAL */}
      {editorOpen && draft ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={isNewDraft ? 'Nouvelle bannière' : 'Éditer la bannière'}
        >
          <form
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void saveDraft();
            }}
            className="my-4 w-full max-w-5xl space-y-5 rounded-3xl border border-gold-400/20 bg-neutral-950 p-4 shadow-2xl md:p-6"
          >
            {/* Modal header */}
            <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                  <Pencil size={18} className="text-gold-400" />
                  {isNewDraft ? 'Nouvelle bannière' : 'Éditer la bannière'}
                </h2>
                <p className="mt-1 text-xs text-neutral-400">
                  ID: {draft.id} · Ordre: {draft.ordre} · Statut: {statusLabel(getStatus(draft, now))}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Pill
                  className={
                    draftReport.score >= 90
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                      : draftReport.score >= 70
                        ? 'border-gold-500/30 bg-gold-500/10 text-gold-300'
                        : 'border-red-500/30 bg-red-500/10 text-red-300'
                  }
                >
                  <Check size={12} />
                  Score {draftReport.score}
                </Pill>

                <Button type="button" variant="outline" onClick={closeEditor}>
                  <X size={16} className="mr-2" />
                  Fermer
                </Button>

                <Button type="submit" variant="luxe">
                  <Save size={16} className="mr-2" />
                  Enregistrer localement
                </Button>
              </div>
            </div>

            {/* Validation */}
            {draftReport.errors.length > 0 || draftReport.warnings.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {draftReport.errors.length > 0 ? (
                  <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                    <p className="mb-2 flex items-center gap-2 font-semibold">
                      <AlertTriangle size={14} /> Erreurs bloquantes
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs">
                      {draftReport.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {draftReport.warnings.length > 0 ? (
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                    <p className="mb-2 flex items-center gap-2 font-semibold">
                      <Info size={14} /> Avertissements
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs">
                      {draftReport.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
                <p className="flex items-center gap-2 font-semibold">
                  <Check size={14} /> Aucun problème détecté.
                </p>
              </div>
            )}

            <div className="grid gap-5 xl:grid-cols-3">
              {/* Left column */}
              <div className="space-y-5 xl:col-span-2">
                <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                    <Megaphone size={16} />
                    Contenu
                  </h3>

                  <div>
                    <FieldLabel>
                      Message affiché * ({draft.message.length}/500)
                    </FieldLabel>
                    <textarea
                      value={draft.message}
                      onChange={(event) => patchDraft({ message: event.target.value })}
                      placeholder="Livraison offerte dès 50$ d'achat !"
                      maxLength={500}
                      className="min-h-[110px] w-full resize-y rounded-xl border border-white/10 bg-black px-3 py-2 text-white outline-none focus:ring-1 focus:ring-gold-400"
                    />
                  </div>

                  <div>
                    <FieldLabel>Templates rapides</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {MESSAGE_TEMPLATES.map((template) => (
                        <button
                          key={template}
                          type="button"
                          onClick={() => patchDraft({ message: template })}
                          className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-neutral-300 transition hover:border-gold-400/40 hover:text-white"
                        >
                          {template.slice(0, 34)}
                          {template.length > 34 ? '…' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Lien de redirection (optionnel)</FieldLabel>
                    <Input
                      value={draft.lien || ''}
                      onChange={(event) => patchDraft({ lien: event.target.value || null })}
                      placeholder="/promotions ou https://..."
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <FieldLabel>Date de début</FieldLabel>
                      <Input
                        type="datetime-local"
                        value={toInputDateTime(draft.date_debut)}
                        onChange={(event) => patchDraft({ date_debut: fromInputDateTime(event.target.value) })}
                      />
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(['today', 'tomorrow', 'plus7', 'plus30', 'clear'] as const).map((preset) => (
                          <button
                            key={`start-${preset}`}
                            type="button"
                            onClick={() => setDraftDatePreset('date_debut', preset)}
                            className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-neutral-300 hover:text-white"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <FieldLabel>Date de fin</FieldLabel>
                      <Input
                        type="datetime-local"
                        value={toInputDateTime(draft.date_fin)}
                        onChange={(event) => patchDraft({ date_fin: fromInputDateTime(event.target.value) })}
                      />
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(['today', 'tomorrow', 'plus7', 'plus30', 'clear'] as const).map((preset) => (
                          <button
                            key={`end-${preset}`}
                            type="button"
                            onClick={() => setDraftDatePreset('date_fin', preset)}
                            className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-neutral-300 hover:text-white"
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-white">
                      <input
                        type="checkbox"
                        checked={draft.actif}
                        onChange={(event) => patchDraft({ actif: event.target.checked })}
                        className="h-4 w-4 rounded border-neutral-600 bg-black text-gold-500 focus:ring-gold-500"
                      />
                      Bannière active
                    </label>

                    <div className="min-w-[140px]">
                      <FieldLabel>Ordre (automatique)</FieldLabel>
                      <div className="flex h-10 items-center rounded-xl border border-white/10 bg-black px-3 text-sm text-neutral-300">
                        #{draft.ordre}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                    <Wand2 size={16} />
                    UTM Builder
                  </h3>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <FieldLabel>utm_source</FieldLabel>
                      <Input
                        value={utm.utm_source}
                        onChange={(event) => setUtm((prev) => ({ ...prev, utm_source: event.target.value }))}
                        placeholder="promo-banner"
                      />
                    </div>

                    <div>
                      <FieldLabel>utm_medium</FieldLabel>
                      <Input
                        value={utm.utm_medium}
                        onChange={(event) => setUtm((prev) => ({ ...prev, utm_medium: event.target.value }))}
                        placeholder="site"
                      />
                    </div>

                    <div>
                      <FieldLabel>utm_campaign</FieldLabel>
                      <Input
                        value={utm.utm_campaign}
                        onChange={(event) => setUtm((prev) => ({ ...prev, utm_campaign: event.target.value }))}
                        placeholder="summer-sale"
                      />
                    </div>

                    <div>
                      <FieldLabel>utm_term</FieldLabel>
                      <Input
                        value={utm.utm_term}
                        onChange={(event) => setUtm((prev) => ({ ...prev, utm_term: event.target.value }))}
                        placeholder="parfum"
                      />
                    </div>

                    <div>
                      <FieldLabel>utm_content</FieldLabel>
                      <Input
                        value={utm.utm_content}
                        onChange={(event) => setUtm((prev) => ({ ...prev, utm_content: event.target.value }))}
                        placeholder="banner-1"
                      />
                    </div>

                    <div className="flex items-end">
                      <Button type="button" variant="luxe" className="h-10 w-full" onClick={applyUtmToDraft}>
                        <Link2 size={14} className="mr-2" />
                        Appliquer au lien
                      </Button>
                    </div>
                  </div>
                </section>
              </div>

              {/* Right column */}
              <div className="space-y-5">
                <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                    <Eye size={16} />
                    Aperçu live
                  </h3>

                  <BannerPreview message={draft.message} lien={draft.lien} />

                  <div className="space-y-2 text-xs text-neutral-400">
                    <p>
                      Statut: <StatusPill status={getStatus(draft, now)} />
                    </p>
                    <p>Début: {formatDateTime(draft.date_debut)}</p>
                    <p>Fin: {formatDateTime(draft.date_fin)}</p>
                    <p>
                      Lien: {draft.lien || '—'}
                      {draft.lien && isExternalLink(draft.lien) ? (
                        <span className="ml-1 inline-flex items-center gap-1 text-blue-300">
                          <ExternalLink size={10} /> externe
                        </span>
                      ) : null}
                    </p>
                  </div>
                </section>

                <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                    <Info size={16} />
                    Conseils
                  </h3>

                  <ul className="space-y-2 text-xs text-neutral-400">
                    <li>• Garde le message court, idéalement moins de 120 caractères.</li>
                    <li>• Utilise un lien interne commençant par “/” pour la navigation SPA.</li>
                    <li>• Les UTM aident à mesurer l’efficacité de la bannière.</li>
                    <li>• Programme les campagnes avec date_debut / date_fin.</li>
                    <li>• N’oublie pas d’enregistrer après modifications.</li>
                  </ul>
                </section>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      <ScrollToTop variant="circle" showProgress />
    </Container>
  );
}