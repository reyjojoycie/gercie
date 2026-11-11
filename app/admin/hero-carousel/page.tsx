//app/admin/hero-carousel/page.tsx
'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Component,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { HeroCarousel } from '@/components/home/HeroCarousel';
import { toast, ToastProvider } from '@/components/ui/Toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import {
  Trash2,
  Plus,
  Save,
  GripVertical,
  Calendar,
  Eye,
  EyeOff,
  Search,
  Filter,
  Upload,
  Download,
  Copy,
  Check,
  X,
  AlertTriangle,
  Settings,
  Layers,
  Link2,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Info,
  Wand2,
  Clock,
  Tag,
  ShieldCheck,
  Database,
  FileJson,
  Keyboard,
  Loader2,
  Pencil,
  Power,
  Maximize2,
  Play,
  Pause,
  ListChecks,
  Star,
  MonitorSmartphone,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════ */
/*  TYPES                                                          */
/* ═══════════════════════════════════════════════════════════════ */

type Direction = 'horizontal' | 'vertical';
type SlideStatus = 'active' | 'inactive' | 'scheduled' | 'expired';
type AnimationVariant = 'slide' | 'fade' | 'zoom';
type TextPosition = 'left' | 'center' | 'right';
type ButtonVariant = 'gold' | 'luxe' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';
type DeviceVisibility = 'all' | 'desktop' | 'mobile';
type Audience = 'all' | 'logged_out' | 'logged_in';
type ApprovalStatus = 'draft' | 'review' | 'approved';

interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

interface SlideConfig {
  image_alt?: string;
  overlay_opacity?: number;
  text_position?: TextPosition;
  button_variant?: ButtonVariant;
  button_size?: ButtonSize;
  link_target?: '_self' | '_blank';
  utm?: UtmParams;
  tags?: string[];
  device_visibility?: DeviceVisibility;
  audience?: Audience;
  priority_score?: number;
  analytics_id?: string;
  css_class?: string;
  animation_delay?: number;
  mobile_image_url?: string;
  desktop_image_url?: string;
  video_url?: string;
  background_color?: string;
  gradient_from?: string;
  gradient_to?: string;
  custom_style?: string;
  notes?: string;
  approval_status?: ApprovalStatus;
  created_by?: string;
  updated_by?: string;
  [key: string]: unknown;
}

interface Slide {
  id: string;
  title: string;
  highlight: string;
  description: string;
  image_url: string;
  cta_label: string;
  cta_href: string;
  is_active: boolean;
  sort_order: number;
  start_date?: string | null;
  end_date?: string | null;
  image_alt?: string;
  config?: SlideConfig;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

interface BasicSettings {
  direction: Direction;
  interval_ms: number;
  autoplay_enabled: boolean;
}

interface AdvancedSettings {
  showProgress: boolean;
  showCounter: boolean;
  enableFullscreen: boolean;
  disableAutoplayOnMobile: boolean;
  pauseOnHover: boolean;
  loop: boolean;
  swipeEnabled: boolean;
  keyboardEnabled: boolean;
  preloadSlides: number;
  transitionDuration: number;
  animationVariant: AnimationVariant;
  overlayOpacity: number;
  textPosition: TextPosition;
  cacheTTL: number;
  autoRefreshInterval: number;
  adaptiveInterval: boolean;
  personalized: boolean;
  showMobileControls: boolean;
  highPriorityFirst: boolean;
  accessibilityLive: boolean;
  reduceMotionFallback: boolean;
  [key: string]: unknown;
}

interface ValidationReport {
  errors: string[];
  warnings: string[];
  score: number;
}

/* ═══════════════════════════════════════════════════════════════ */
/*  CONSTANTS                                                      */
/* ═══════════════════════════════════════════════════════════════ */

const DEFAULT_BASIC: BasicSettings = {
  direction: 'horizontal',
  interval_ms: 5000,
  autoplay_enabled: true,
};

const DEFAULT_ADVANCED: AdvancedSettings = {
  showProgress: true,
  showCounter: true,
  enableFullscreen: false,
  disableAutoplayOnMobile: true,
  pauseOnHover: true,
  loop: true,
  swipeEnabled: true,
  keyboardEnabled: true,
  preloadSlides: 2,
  transitionDuration: 0.5,
  animationVariant: 'slide',
  overlayOpacity: 55,
  textPosition: 'left',
  cacheTTL: 5,
  autoRefreshInterval: 0,
  adaptiveInterval: true,
  personalized: false,
  showMobileControls: true,
  highPriorityFirst: false,
  accessibilityLive: true,
  reduceMotionFallback: true,
};

const KNOWN_SETTINGS_COLUMNS = [
  'id',
  'direction',
  'interval_ms',
  'autoplay_enabled',
  'created_at',
  'updated_at',
];

const KNOWN_SLIDE_COLUMNS = [
  'id',
  'title',
  'highlight',
  'description',
  'image_url',
  'cta_label',
  'cta_href',
  'is_active',
  'sort_order',
  'start_date',
  'end_date',
  'created_at',
  'updated_at',
];

const ANIMATION_VARIANTS: AnimationVariant[] = ['slide', 'fade', 'zoom'];
const TEXT_POSITIONS: TextPosition[] = ['left', 'center', 'right'];
const BUTTON_VARIANTS: ButtonVariant[] = ['gold', 'luxe', 'outline', 'ghost'];
const BUTTON_SIZES: ButtonSize[] = ['sm', 'md', 'lg'];
const DEVICE_VISIBILITIES: DeviceVisibility[] = ['all', 'desktop', 'mobile'];
const AUDIENCES: Audience[] = ['all', 'logged_out', 'logged_in'];
const APPROVAL_STATUSES: ApprovalStatus[] = ['draft', 'review', 'approved'];

const inputClass =
  'w-full h-10 bg-black text-white border border-white/10 rounded-xl px-3 focus:ring-1 focus:ring-gold-400 outline-none';
const textareaClass =
  'w-full min-h-[92px] bg-black text-white border border-white/10 rounded-xl px-3 py-2 focus:ring-1 focus:ring-gold-400 outline-none resize-y';
const selectClass =
  'w-full h-10 bg-black text-white border border-white/10 rounded-xl px-3 focus:ring-1 focus:ring-gold-400 outline-none';
const labelClass = 'block text-xs font-medium text-neutral-300 mb-2 uppercase';
const cardClass = 'p-5 bg-midnight-900/70 border border-gold-400/20 rounded-2xl space-y-4';
const subtleTextClass = 'text-xs text-neutral-400';

/* ═══════════════════════════════════════════════════════════════ */
/*  UTILS                                                          */
/* ═══════════════════════════════════════════════════════════════ */

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function omitUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function omitKeys<T extends Record<string, unknown>>(obj: T, keys: string[]): Partial<T> {
  const copy = { ...obj };
  keys.forEach((key) => delete copy[key]);
  return copy;
}

function isValidUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('/') || v.startsWith('#') || v.startsWith('mailto:') || v.startsWith('tel:')) {
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

function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function toInputDate(date: Date): string {
  return date.toLocaleDateString('sv');
}

function parseDateValue(value?: string | null, endOfDay = false): Date | null {
  if (!value) return null;
  const normalized =
    String(value).length === 10
      ? `${value}T${endOfDay ? '23:59:59' : '00:00:00'}`
      : String(value);
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = parseDateValue(value);
  if (!date) return String(value);
  return date.toLocaleDateString('fr-FR');
}

function getSlideStatus(slide: Slide, now: Date): SlideStatus {
  if (!slide.is_active) return 'inactive';

  const start = parseDateValue(slide.start_date);
  const end = parseDateValue(slide.end_date, true);

  if (start && start > now) return 'scheduled';
  if (end && end < now) return 'expired';
  return 'active';
}

function statusLabel(status: SlideStatus): string {
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

function parseTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function mergeTags(existing: string[] | undefined, additions: string[]): string[] {
  return Array.from(new Set([...(existing || []), ...additions.filter(Boolean)]));
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string): Promise<boolean> {
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

function testImageUrl(url: string, timeoutMs = 8000): Promise<'ok' | 'error' | 'timeout'> {
  return new Promise((resolve) => {
    if (!url) {
      resolve('error');
      return;
    }

    const img = new window.Image();
    const timer = window.setTimeout(() => resolve('timeout'), timeoutMs);

    img.onload = () => {
      window.clearTimeout(timer);
      resolve('ok');
    };

    img.onerror = () => {
      window.clearTimeout(timer);
      resolve('error');
    };

    img.src = url;
  });
}

function normalizeBasic(row: unknown): BasicSettings {
  const data = asObject(row);
  return {
    direction: data.direction === 'vertical' ? 'vertical' : 'horizontal',
    interval_ms: clamp(Number(data.interval_ms) || DEFAULT_BASIC.interval_ms, 1000, 120000),
    autoplay_enabled:
      typeof data.autoplay_enabled === 'boolean'
        ? data.autoplay_enabled
        : DEFAULT_BASIC.autoplay_enabled,
  };
}

function normalizeAdvanced(row: unknown): AdvancedSettings {
  const data = asObject(row);
  const options = asObject(data.options);
  const merged = { ...DEFAULT_ADVANCED, ...options };

  return {
    ...merged,
    showProgress: Boolean(merged.showProgress),
    showCounter: Boolean(merged.showCounter),
    enableFullscreen: Boolean(merged.enableFullscreen),
    disableAutoplayOnMobile: Boolean(merged.disableAutoplayOnMobile),
    pauseOnHover: Boolean(merged.pauseOnHover),
    loop: Boolean(merged.loop),
    swipeEnabled: Boolean(merged.swipeEnabled),
    keyboardEnabled: Boolean(merged.keyboardEnabled),
    adaptiveInterval: Boolean(merged.adaptiveInterval),
    personalized: Boolean(merged.personalized),
    showMobileControls: Boolean(merged.showMobileControls),
    highPriorityFirst: Boolean(merged.highPriorityFirst),
    accessibilityLive: Boolean(merged.accessibilityLive),
    reduceMotionFallback: Boolean(merged.reduceMotionFallback),
    preloadSlides: clamp(Number(merged.preloadSlides) || 2, 0, 10),
    transitionDuration: clamp(Number(merged.transitionDuration) || 0.5, 0, 3),
    overlayOpacity: clamp(Number(merged.overlayOpacity) || 55, 0, 100),
    cacheTTL: clamp(Number(merged.cacheTTL) || 5, 0, 120),
    autoRefreshInterval: clamp(Number(merged.autoRefreshInterval) || 0, 0, 3600),
    animationVariant: ANIMATION_VARIANTS.includes(merged.animationVariant as AnimationVariant)
      ? (merged.animationVariant as AnimationVariant)
      : 'slide',
    textPosition: TEXT_POSITIONS.includes(merged.textPosition as TextPosition)
      ? (merged.textPosition as TextPosition)
      : 'left',
  };
}

function normalizeSlide(row: unknown): Slide {
  const data = asObject(row);
  const config = asObject(data.config) as SlideConfig;

  return {
    ...(data as Slide),
    id: String(data.id ?? ''),
    title: String(data.title ?? ''),
    highlight: String(data.highlight ?? ''),
    description: String(data.description ?? ''),
    image_url: String(data.image_url ?? ''),
    cta_label: String(data.cta_label ?? ''),
    cta_href: String(data.cta_href ?? ''),
    is_active: Boolean(data.is_active),
    sort_order: Number(data.sort_order) || 0,
    start_date: (data.start_date as string | null | undefined) ?? null,
    end_date: (data.end_date as string | null | undefined) ?? null,
    image_alt: String(data.image_alt ?? config.image_alt ?? data.title ?? ''),
    config: {
      ...config,
      image_alt: String(config.image_alt ?? data.image_alt ?? data.title ?? ''),
      tags: Array.isArray(config.tags) ? config.tags.map(String) : [],
      utm: asObject(config.utm) as UtmParams,
      overlay_opacity: clamp(Number(config.overlay_opacity ?? 55), 0, 100),
      text_position: TEXT_POSITIONS.includes(config.text_position as TextPosition)
        ? (config.text_position as TextPosition)
        : 'left',
      button_variant: BUTTON_VARIANTS.includes(config.button_variant as ButtonVariant)
        ? (config.button_variant as ButtonVariant)
        : 'gold',
      button_size: BUTTON_SIZES.includes(config.button_size as ButtonSize)
        ? (config.button_size as ButtonSize)
        : 'lg',
      link_target: config.link_target === '_blank' ? '_blank' : '_self',
      device_visibility: DEVICE_VISIBILITIES.includes(config.device_visibility as DeviceVisibility)
        ? (config.device_visibility as DeviceVisibility)
        : 'all',
      audience: AUDIENCES.includes(config.audience as Audience)
        ? (config.audience as Audience)
        : 'all',
      approval_status: APPROVAL_STATUSES.includes(config.approval_status as ApprovalStatus)
        ? (config.approval_status as ApprovalStatus)
        : 'draft',
      priority_score: Number(config.priority_score ?? 0),
      animation_delay: clamp(Number(config.animation_delay ?? 0), 0, 3000),
    },
  };
}

function validateSlideDraft(slide: Slide | null): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!slide) {
    return { errors: ['Aucune slide à valider.'], warnings: [], score: 0 };
  }

  if (!slide.title.trim()) errors.push('Le titre est obligatoire.');
  if (!slide.image_url.trim()) errors.push("L'image est obligatoire.");

  if (slide.cta_label.trim() && !slide.cta_href.trim()) {
    errors.push('Si le bouton a un texte, le lien du bouton est obligatoire.');
  }

  if (slide.cta_href.trim() && !isValidUrl(slide.cta_href)) {
    errors.push('Le lien du bouton est invalide.');
  }

  const start = parseDateValue(slide.start_date);
  const end = parseDateValue(slide.end_date, true);

  if (slide.start_date && !start) errors.push('Date de début invalide.');
  if (slide.end_date && !end) errors.push('Date de fin invalide.');
  if (start && end && start > end) errors.push('La date de fin doit être après la date de début.');

  if (slide.title.length > 80) warnings.push('Le titre dépasse 80 caractères.');
  if (slide.highlight.length > 40) warnings.push('Le surlignage dépasse 40 caractères.');
  if (slide.description.length > 180) warnings.push('La description dépasse 180 caractères.');
  if (slide.cta_label.length > 30) warnings.push('Le texte du bouton dépasse 30 caractères.');
  if (!slide.image_alt?.trim() && !slide.config?.image_alt?.trim()) {
    warnings.push('Un texte alternatif (alt) est recommandé pour l’accessibilité.');
  }
  if (slide.cta_href.trim() && !isExternalUrl(slide.cta_href) && !slide.cta_href.startsWith('/')) {
    warnings.push('Les liens internes devraient commencer par "/".');
  }

  const score = Math.max(0, 100 - errors.length * 25 - warnings.length * 5);
  return { errors, warnings, score };
}

function buildUtmHref(currentHref: string, utm: UtmParams): string | null {
  const href = currentHref.trim();
  if (!href) return null;
  if (href.startsWith('mailto:') || href.startsWith('tel:')) return null;

  try {
    const absolute = href.startsWith('http') ? href : `http://local${href.startsWith('/') ? '' : '/'}${href}`;
    const url = new URL(absolute);

    Object.entries(utm).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, String(value));
      else url.searchParams.delete(key);
    });

    return href.startsWith('http') ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SMALL UI COMPONENTS                                            */
/* ═══════════════════════════════════════════════════════════════ */

function Toggle({
  label,
  checked,
  onChange,
  hint,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/30 p-3 transition hover:border-gold-400/30">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-neutral-600 bg-black text-gold-500 focus:ring-gold-500"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-medium text-white">
          {icon}
          {label}
        </span>
        {hint ? <span className="mt-1 block text-xs text-neutral-400">{hint}</span> : null}
      </span>
    </label>
  );
}

function StatusBadge({ status }: { status: SlideStatus }) {
  const styles: Record<SlideStatus, string> = {
    active: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
    scheduled: 'border-blue-500/30 bg-blue-500/15 text-blue-300',
    expired: 'border-red-500/30 bg-red-500/15 text-red-300',
    inactive: 'border-neutral-500/30 bg-neutral-500/15 text-neutral-300',
  };

  return (
    <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', styles[status])}>
      {statusLabel(status)}
    </span>
  );
}

function MiniBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'gold' | 'blue' | 'red' | 'green' }) {
  const tones = {
    neutral: 'border-white/10 bg-white/5 text-neutral-300',
    gold: 'border-gold-400/30 bg-gold-500/10 text-gold-300',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    red: 'border-red-500/30 bg-red-500/10 text-red-300',
    green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  };

  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]', tones[tone])}>
      {children}
    </span>
  );
}

function SectionTitle({ icon, title, subtitle }: { icon?: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="space-y-1">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
        {icon}
        {title}
      </h3>
      {subtitle ? <p className={subtleTextClass}>{subtitle}</p> : null}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SORTABLE ROW                                                   */
/* ═══════════════════════════════════════════════════════════════ */

interface SortableSlideRowProps {
  slide: Slide;
  index: number;
  isSelected: boolean;
  canDrag: boolean;
  isSaving: boolean;
  now: Date;
  imageStatus?: string;
  onSelect: (id: string, checked: boolean) => void;
  onEdit: (slide: Slide) => void;
  onDuplicate: (slide: Slide) => void;
  onDelete: (id: string) => void;
  onToggleActive: (slide: Slide) => void;
}

function SortableSlideRow({
  slide,
  index,
  isSelected,
  canDrag,
  isSaving,
  now,
  imageStatus,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onToggleActive,
}: SortableSlideRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slide.id });

  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition ?? undefined,
    opacity: isDragging ? 0.65 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const status = getSlideStatus(slide, now);
  const tags = slide.config?.tags || [];
  const hasImage = Boolean(slide.image_url);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cx(
        'group relative flex flex-col gap-3 rounded-2xl border p-3 transition md:flex-row md:items-center',
        isSelected ? 'border-gold-500/60 bg-gold-500/5' : 'border-white/10 bg-black/30 hover:border-white/20',
        isDragging && 'shadow-2xl'
      )}
    >
      <div className="flex items-center gap-2 md:flex-col md:items-start">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(event) => onSelect(slide.id, event.target.checked)}
          className="h-4 w-4 rounded border-neutral-600 bg-black text-gold-500 focus:ring-gold-500"
          aria-label={`Sélectionner ${slide.title || 'slide'}`}
        />

        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          {...listeners}
          disabled={!canDrag}
          className={cx(
            'rounded-lg p-1.5 text-neutral-400 transition',
            canDrag ? 'cursor-grab hover:bg-white/10 hover:text-white active:cursor-grabbing' : 'cursor-not-allowed opacity-30'
          )}
          aria-label="Glisser pour réordonner"
          title={canDrag ? 'Glisser pour réordonner' : 'Réordonnement désactivé avec filtres/tri'}
        >
          <GripVertical size={16} />
        </button>
      </div>

      <div className="relative h-16 w-full shrink-0 overflow-hidden rounded-xl bg-neutral-800 md:w-28">
        {hasImage ? (
          <img
            src={slide.image_url}
            alt={slide.image_alt || slide.title || 'Bannière'}
            loading="lazy"
            className="h-full w-full object-cover"
            onError={(event) => {
              (event.currentTarget as HTMLImageElement).style.opacity = '0.15';
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500">
            Aucune image
          </div>
        )}

        {imageStatus ? (
          <div
            className={cx(
              'absolute right-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold',
              imageStatus === 'ok' && 'bg-emerald-500 text-black',
              imageStatus === 'error' && 'bg-red-500 text-white',
              imageStatus === 'timeout' && 'bg-amber-500 text-black',
              imageStatus === 'loading' && 'bg-blue-500 text-white'
            )}
          >
            {imageStatus === 'ok' ? 'OK' : imageStatus === 'loading' ? '…' : imageStatus?.toUpperCase()}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-mono text-neutral-500">#{index + 1}</span>
          <StatusBadge status={status} />
          {slide.config?.approval_status ? (
            <MiniBadge tone={slide.config.approval_status === 'approved' ? 'green' : slide.config.approval_status === 'review' ? 'blue' : 'neutral'}>
              {slide.config.approval_status}
            </MiniBadge>
          ) : null}
          {slide.config?.priority_score ? (
            <MiniBadge tone="gold">
              <Star size={10} /> {slide.config.priority_score}
            </MiniBadge>
          ) : null}
          <span className="truncate text-sm font-semibold text-white">{slide.title || 'Sans titre'}</span>
        </div>

        <p className="mt-1 line-clamp-1 text-xs text-neutral-400">
          {slide.description || slide.highlight || '—'}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-400">
          <MiniBadge>
            <Calendar size={10} /> {formatDate(slide.start_date)} → {formatDate(slide.end_date)}
          </MiniBadge>

          {slide.cta_label ? (
            <MiniBadge tone="gold">
              <Link2 size={10} /> {slide.cta_label}
            </MiniBadge>
          ) : null}

          {slide.cta_href ? (
            <MiniBadge tone={isExternalUrl(slide.cta_href) ? 'blue' : 'neutral'}>
              {isExternalUrl(slide.cta_href) ? <ExternalLink size={10} /> : <Eye size={10} />}
              {slide.cta_href.slice(0, 28)}
              {slide.cta_href.length > 28 ? '…' : ''}
            </MiniBadge>
          ) : null}

          {tags.slice(0, 4).map((tag) => (
            <MiniBadge key={tag} tone="neutral">
              <Tag size={10} /> {tag}
            </MiniBadge>
          ))}

          {tags.length > 4 ? <MiniBadge>+{tags.length - 4}</MiniBadge> : null}
        </div>
      </div>

      <div className="flex items-center gap-1 md:flex-col md:items-end">
        {isSaving ? <Loader2 size={16} className="animate-spin text-gold-400" /> : null}

        <button
          type="button"
          onClick={() => onEdit(slide)}
          className="rounded-lg p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white"
          title="Éditer"
          aria-label="Éditer la slide"
        >
          <Pencil size={16} />
        </button>

        <button
          type="button"
          onClick={() => onToggleActive(slide)}
          className={cx(
            'rounded-lg p-2 transition hover:bg-white/10',
            slide.is_active ? 'text-emerald-300 hover:text-emerald-200' : 'text-neutral-400 hover:text-white'
          )}
          title={slide.is_active ? 'Désactiver' : 'Activer'}
          aria-label={slide.is_active ? 'Désactiver la slide' : 'Activer la slide'}
        >
          {slide.is_active ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>

        <button
          type="button"
          onClick={() => onDuplicate(slide)}
          className="rounded-lg p-2 text-neutral-300 transition hover:bg-white/10 hover:text-white"
          title="Dupliquer"
          aria-label="Dupliquer la slide"
        >
          <Copy size={16} />
        </button>

        <button
          type="button"
          onClick={() => onDelete(slide.id)}
          className="rounded-lg p-2 text-red-300 transition hover:bg-red-500/10 hover:text-red-200"
          title="Supprimer"
          aria-label="Supprimer la slide"
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/*  SIMPLE PREVIEW FALLBACK                                        */
/* ═══════════════════════════════════════════════════════════════ */

function SimplePreview({
  slides,
  intervalMs,
  autoplayEnabled,
  showProgress,
  showCounter,
  disableAutoplayOnMobile,
}: {
  slides: Array<{
    id: string;
    title: string;
    highlight: string;
    description: string;
    image_url: string;
    cta_label: string;
    cta_href: string;
    image_alt?: string;
  }>;
  intervalMs: number;
  autoplayEnabled: boolean;
  showProgress: boolean;
  showCounter: boolean;
  disableAutoplayOnMobile: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    setIndex(0);
    setProgress(0);
  }, [slides]);

  const shouldAutoplay = autoplayEnabled && !paused && slides.length > 1 && !(disableAutoplayOnMobile && isMobile);

  useEffect(() => {
    if (!shouldAutoplay) return;

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const percent = Math.min((elapsed / intervalMs) * 100, 100);
      setProgress(percent);

      if (elapsed >= intervalMs) {
        setIndex((prev) => (prev + 1) % slides.length);
        setProgress(0);
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [shouldAutoplay, intervalMs, slides.length]);

  const slide = slides[index];
  if (!slide) return null;

  return (
    <div
      className="relative aspect-[2/1] w-full overflow-hidden rounded-2xl bg-neutral-900 md:aspect-[3/1]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slide.image_url ? (
        <img src={slide.image_url} alt={slide.image_alt || slide.title} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent" />

      <div className="relative z-10 flex h-full flex-col justify-center p-6 text-white">
        {slide.highlight ? (
          <span className="mb-2 inline-flex w-fit items-center gap-2 rounded-full bg-gold-500/90 px-3 py-1 text-xs font-semibold text-black">
            <Sparkles size={12} />
            {slide.highlight}
          </span>
        ) : null}

        <h2 className="text-2xl font-bold md:text-4xl">{slide.title}</h2>
        <p className="mt-2 line-clamp-3 max-w-xl text-sm text-neutral-200 md:text-base">{slide.description}</p>

        {slide.cta_label ? (
          <span className="mt-4 inline-flex w-fit rounded-full bg-gold-500 px-4 py-2 text-sm font-semibold text-black">
            {slide.cta_label}
          </span>
        ) : null}
      </div>

      {showCounter && slides.length > 1 ? (
        <div className="absolute left-4 top-4 rounded-full bg-black/50 px-3 py-1 text-xs text-white backdrop-blur">
          {index + 1} / {slides.length}
        </div>
      ) : null}

      {showProgress && shouldAutoplay ? (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
          <div className="h-full bg-gold-500 transition-all duration-100 ease-linear" style={{ width: `${progress}%` }} />
        </div>
      ) : null}

      {slides.length > 1 ? (
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
          {slides.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setIndex(itemIndex);
                setProgress(0);
              }}
              className={cx('h-2 rounded-full transition-all', itemIndex === index ? 'w-6 bg-gold-500' : 'w-2 bg-white/50 hover:bg-white/80')}
              aria-label={`Aller à la slide ${itemIndex + 1}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

class PreviewErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('Preview HeroCarousel fallback:', error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/* ═══════════════════════════════════════════════════════════════ */
/*  MAIN ADMIN COMPONENT                                           */
/* ═══════════════════════════════════════════════════════════════ */

export default function AdminHeroCarousel() {
  const [activeTab, setActiveTab] = useState<'settings' | 'slides' | 'preview' | 'tools'>('settings');

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [basic, setBasic] = useState<BasicSettings>(DEFAULT_BASIC);
  const [advanced, setAdvanced] = useState<AdvancedSettings>(DEFAULT_ADVANCED);
  const [initialBasic, setInitialBasic] = useState<BasicSettings>(DEFAULT_BASIC);
  const [initialAdvanced, setInitialAdvanced] = useState<AdvancedSettings>(DEFAULT_ADVANCED);

  const [slides, setSlides] = useState<Slide[]>([]);

  const [supportedSettingsColumns, setSupportedSettingsColumns] = useState<Set<string>>(new Set(KNOWN_SETTINGS_COLUMNS));
  const [supportedSlideColumns, setSupportedSlideColumns] = useState<Set<string>>(new Set(KNOWN_SLIDE_COLUMNS));

  const [hasSettingsOptions, setHasSettingsOptions] = useState(false);
  const [hasSlideConfig, setHasSlideConfig] = useState(false);
  const [hasDetectedSettingsRow, setHasDetectedSettingsRow] = useState(false);
  const [hasDetectedSlideColumns, setHasDetectedSlideColumns] = useState(false);

  const [savingSettings, setSavingSettings] = useState(false);
  const [savingSlideId, setSavingSlideId] = useState<string | null>(null);
  const [savingEditor, setSavingEditor] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SlideStatus>('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'order' | 'title' | 'start' | 'status'>('order');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [isNewSlide, setIsNewSlide] = useState(false);

  const [autoSave, setAutoSave] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const [previewScope, setPreviewScope] = useState<'all' | 'active' | 'filtered' | 'selected'>('active');
  const [previewIncludeExpired, setPreviewIncludeExpired] = useState(false);

  const [imageChecks, setImageChecks] = useState<Record<string, string>>({});
  const [checkingImages, setCheckingImages] = useState(false);

  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<{
    slides: Slide[];
    settings?: { basic: BasicSettings; advanced: AdvancedSettings };
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkEndDate, setBulkEndDate] = useState('');
  const [bulkTag, setBulkTag] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  /* ───────────────────────────────────────────────────────────── */
  /*  NOTIFY                                                       */
  /* ───────────────────────────────────────────────────────────── */

  const notify = useCallback((type: 'success' | 'error' | 'info' | 'warning', message: string) => {
    try {
      (toast as unknown as { addToast?: (input: { type: string; message: string }) => void })?.addToast?.({ type, message });
    } catch {
      console.log(`[${type}] ${message}`);
    }
  }, []);

  /* ───────────────────────────────────────────────────────────── */
  /*  FETCH ALL                                                    */
  /* ───────────────────────────────────────────────────────────── */

  const fetchAll = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);
      setLoadError(null);

      try {
        const [settingsRes, slidesRes] = await Promise.all([
          supabaseBrowser.from('hero_settings').select('*').maybeSingle(),
          supabaseBrowser.from('hero_slides').select('*').order('sort_order', { ascending: true }),
        ]);

        if (slidesRes.error) throw slidesRes.error;

        if (settingsRes.error && settingsRes.error.code !== 'PGRST116') {
          notify('warning', `Paramètres hero: ${settingsRes.error.message || 'erreur inconnue'}`);
        }

        const settingsRow = settingsRes.data;
        const rows = (slidesRes.data || []) as unknown[];

        const settingsColumns = new Set(Object.keys(asObject(settingsRow)));
        const slideColumns = new Set<string>();
        rows.forEach((row) => {
          Object.keys(asObject(row)).forEach((key) => slideColumns.add(key));
        });

        setSupportedSettingsColumns(settingsColumns);
        setSupportedSlideColumns(slideColumns.size > 0 ? slideColumns : new Set(KNOWN_SLIDE_COLUMNS));
        setHasSettingsOptions(settingsColumns.has('options'));
        setHasSlideConfig(slideColumns.has('config'));
        setHasDetectedSettingsRow(Boolean(settingsRow));
        setHasDetectedSlideColumns(rows.length > 0);

        const nextBasic = normalizeBasic(settingsRow);
        const nextAdvanced = normalizeAdvanced(settingsRow);

        setBasic(nextBasic);
        setAdvanced(nextAdvanced);
        setInitialBasic(clone(nextBasic));
        setInitialAdvanced(clone(nextAdvanced));

        const normalizedSlides = rows.map(normalizeSlide).sort((a, b) => a.sort_order - b.sort_order);
        setSlides(normalizedSlides);
        setSelectedIds(new Set());
        setImageChecks({});
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setLoadError(message);
        notify('error', `Erreur de chargement: ${message}`);
      } finally {
        setLoading(false);
      }
    },
    [notify]
  );

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  /* ───────────────────────────────────────────────────────────── */
  /*  DERIVED                                                      */
  /* ───────────────────────────────────────────────────────────── */

  const allTags = useMemo(() => {
    const set = new Set<string>();
    slides.forEach((slide) => {
      (slide.config?.tags || []).forEach((tag) => set.add(tag));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [slides]);

  const filteredSlides = useMemo(() => {
    let result = [...slides];

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter((slide) =>
        [slide.title, slide.highlight, slide.description, slide.cta_label, slide.cta_href, ...(slide.config?.tags || [])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((slide) => getSlideStatus(slide, now) === statusFilter);
    }

    if (tagFilter !== 'all') {
      result = result.filter((slide) => (slide.config?.tags || []).includes(tagFilter));
    }

    switch (sortBy) {
      case 'title':
        result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'start':
        result.sort((a, b) => {
          const da = parseDateValue(a.start_date)?.getTime() ?? Number.POSITIVE_INFINITY;
          const db = parseDateValue(b.start_date)?.getTime() ?? Number.POSITIVE_INFINITY;
          return da - db;
        });
        break;
      case 'status':
        result.sort((a, b) => getSlideStatus(a, now).localeCompare(getSlideStatus(b, now)));
        break;
      case 'order':
      default:
        result.sort((a, b) => a.sort_order - b.sort_order);
        break;
    }

    return result;
  }, [slides, search, statusFilter, tagFilter, sortBy, now]);

  const selectedSlides = useMemo(() => slides.filter((slide) => selectedIds.has(slide.id)), [slides, selectedIds]);

  const allSelected = useMemo(
    () => filteredSlides.length > 0 && filteredSlides.every((slide) => selectedIds.has(slide.id)),
    [filteredSlides, selectedIds]
  );

  const canDrag = useMemo(
    () => sortBy === 'order' && !search.trim() && statusFilter === 'all' && tagFilter === 'all',
    [sortBy, search, statusFilter, tagFilter]
  );

  const shouldTrackAdvanced = !hasDetectedSettingsRow || hasSettingsOptions;

  const isSettingsDirty = useMemo(() => {
    const basicDirty = JSON.stringify(basic) !== JSON.stringify(initialBasic);
    const advancedDirty = shouldTrackAdvanced && JSON.stringify(advanced) !== JSON.stringify(initialAdvanced);
    return basicDirty || advancedDirty;
  }, [basic, initialBasic, advanced, initialAdvanced, shouldTrackAdvanced]);

  const systemWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (!hasSettingsOptions) warnings.push('hero_settings.options (JSONB) introuvable : les paramètres avancés ne seront pas persistés.');
    if (!hasSlideConfig) warnings.push('hero_slides.config (JSONB) introuvable : les options par slide ne seront pas persistées.');
    if (!supportedSlideColumns.has('image_alt')) warnings.push('hero_slides.image_alt introuvable : le texte alternatif sera stocké dans config si disponible.');
    if (loadError) warnings.push(`Erreur de chargement: ${loadError}`);
    return warnings;
  }, [hasSettingsOptions, hasSlideConfig, supportedSlideColumns, loadError]);

  const suggestedSql = useMemo(
    () => `-- Exécute dans Supabase > SQL Editor pour activer toutes les options avancées.
alter table public.hero_settings
  add column if not exists options jsonb not null default '{}'::jsonb;

alter table public.hero_slides
  add column if not exists config jsonb not null default '{}'::jsonb,
  add column if not exists image_alt text;

create index if not exists hero_slides_active_sort_idx
  on public.hero_slides (is_active, sort_order);

create index if not exists hero_slides_dates_idx
  on public.hero_slides (start_date, end_date);

-- Optionnel : RPC pour réordonner en une transaction.
-- create or replace function public.reorder_hero_slides(slide_ids uuid[])
-- returns void
-- language plpgsql
-- as $$
-- begin
--   update public.hero_slides hs
--   set sort_order = t.ord - 1
--   from unnest(slide_ids) with ordinality as t(id, ord)
--   where hs.id = t.id;
-- end;
-- $$;`,
    []
  );

  /* ───────────────────────────────────────────────────────────── */
  /*  SETTINGS HELPERS                                             */
  /* ───────────────────────────────────────────────────────────── */

  const patchBasic = useCallback((patch: Partial<BasicSettings>) => {
    setBasic((prev) => ({ ...prev, ...patch }));
  }, []);

  const patchAdvanced = useCallback((patch: Partial<AdvancedSettings>) => {
    setAdvanced((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveSettings = useCallback(async () => {
    setSavingSettings(true);

    try {
      const shouldTryOptions = !hasDetectedSettingsRow || hasSettingsOptions;
      const fullPayload = {
        ...basic,
        ...(shouldTryOptions ? { options: advanced } : {}),
      };
      const minimalPayload = { ...basic };

      const { data: existing } = await supabaseBrowser.from('hero_settings').select('id').maybeSingle();

      let firstError: unknown = null;

      if (existing) {
        const res = await supabaseBrowser.from('hero_settings').update(fullPayload).eq('id', existing.id);
        firstError = res.error;
      } else {
        const res = await supabaseBrowser.from('hero_settings').insert([fullPayload]);
        firstError = res.error;
      }

      if (!firstError) {
        setHasSettingsOptions(shouldTryOptions);
        setHasDetectedSettingsRow(true);
        setInitialBasic(clone(basic));
        if (shouldTryOptions) setInitialAdvanced(clone(advanced));
        notify('success', 'Paramètres enregistrés.');
        return;
      }

      if (!shouldTryOptions) {
        throw firstError;
      }

      let retryError: unknown = null;

      if (existing) {
        const res = await supabaseBrowser.from('hero_settings').update(minimalPayload).eq('id', existing.id);
        retryError = res.error;
      } else {
        const res = await supabaseBrowser.from('hero_settings').insert([minimalPayload]);
        retryError = res.error;
      }

      if (retryError) throw retryError;

      setHasSettingsOptions(false);
      setHasDetectedSettingsRow(true);
      setInitialBasic(clone(basic));
      notify('warning', 'Paramètres basiques enregistrés. La colonne options est indisponible, les options avancées ne sont pas persistées.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify('error', `Erreur sauvegarde paramètres: ${message}`);
    } finally {
      setSavingSettings(false);
    }
  }, [basic, advanced, hasDetectedSettingsRow, hasSettingsOptions, notify]);

  const resetSettingsToDefaults = useCallback(() => {
    setBasic(clone(DEFAULT_BASIC));
    setAdvanced(clone(DEFAULT_ADVANCED));
    notify('info', 'Paramètres réinitialisés localement. Pense à enregistrer.');
  }, [notify]);

  /* ───────────────────────────────────────────────────────────── */
  /*  SLIDE PERSISTENCE HELPERS                                    */
  /* ───────────────────────────────────────────────────────────── */

  const canTrySlideOptional = !hasDetectedSlideColumns || hasSlideConfig;

  const buildSlidePayload = useCallback(
    (slide: Slide, includeOptional: boolean): Record<string, unknown> => {
      const payload: Record<string, unknown> = {
        title: slide.title ?? '',
        highlight: slide.highlight ?? '',
        description: slide.description ?? '',
        image_url: slide.image_url ?? '',
        cta_label: slide.cta_label ?? '',
        cta_href: slide.cta_href ?? '',
        is_active: Boolean(slide.is_active),
        sort_order: Number(slide.sort_order) || 0,
        start_date: slide.start_date || null,
        end_date: slide.end_date || null,
      };

      if (!includeOptional) return payload;

      const shouldTryImageAlt = supportedSlideColumns.has('image_alt') || !hasDetectedSlideColumns;
      if (shouldTryImageAlt && slide.image_alt !== undefined) {
        payload.image_alt = slide.image_alt || null;
      }

      if (canTrySlideOptional && slide.config !== undefined) {
        payload.config = slide.config || {};
      }

      if (slide.config) {
        Object.entries(slide.config).forEach(([key, value]) => {
          if (key === 'config') return;
          if (supportedSlideColumns.has(key)) {
            payload[key] = value;
          }
        });
      }

      return omitUndefined(payload);
    },
    [canTrySlideOptional, hasDetectedSlideColumns, supportedSlideColumns]
  );

  const insertSlide = useCallback(
    async (slide: Slide): Promise<Slide> => {
      const fullPayload = buildSlidePayload(slide, true);

      try {
        const { data, error } = await supabaseBrowser.from('hero_slides').insert([fullPayload]).select().single();
        if (error) throw error;

        if (canTrySlideOptional && Object.prototype.hasOwnProperty.call(fullPayload, 'config')) {
          setHasSlideConfig(true);
        }
        setHasDetectedSlideColumns(true);

        return normalizeSlide(data);
      } catch (fullError: unknown) {
        if (!canTrySlideOptional) throw fullError;

        const minimalPayload = buildSlidePayload(slide, false);
        const { data, error } = await supabaseBrowser.from('hero_slides').insert([minimalPayload]).select().single();
        if (error) throw error;

        setHasSlideConfig(false);
        setHasDetectedSlideColumns(true);
        notify('warning', 'Slide créée, mais les champs optionnels/config ne sont pas supportés par la table actuelle.');

        return normalizeSlide(data);
      }
    },
    [buildSlidePayload, canTrySlideOptional, notify]
  );

  const updateSlide = useCallback(
    async (id: string, slide: Slide): Promise<Slide> => {
      const fullPayload = omitKeys(buildSlidePayload(slide, true) as Record<string, unknown>, ['id']);

      try {
        const { data, error } = await supabaseBrowser.from('hero_slides').update(fullPayload).eq('id', id).select().single();
        if (error) throw error;
        return normalizeSlide(data);
      } catch (fullError: unknown) {
        if (!canTrySlideOptional) throw fullError;

        const minimalPayload = omitKeys(buildSlidePayload(slide, false) as Record<string, unknown>, ['id']);
        const { data, error } = await supabaseBrowser.from('hero_slides').update(minimalPayload).eq('id', id).select().single();
        if (error) throw error;

        setHasSlideConfig(false);
        notify('warning', 'Slide mise à jour, mais les champs optionnels/config ne sont pas supportés.');

        return normalizeSlide(data);
      }
    },
    [buildSlidePayload, canTrySlideOptional, notify]
  );

  const reorderSlides = useCallback(async (orderedIds: string[]) => {
    let rpcFailed = false;

    try {
      const { error } = await supabaseBrowser.rpc('reorder_hero_slides', { slide_ids: orderedIds });
      if (!error) return;
      rpcFailed = true;
    } catch {
      rpcFailed = true;
    }

    if (!rpcFailed) return;

    for (let i = 0; i < orderedIds.length; i += 1) {
      const { error } = await supabaseBrowser.from('hero_slides').update({ sort_order: i }).eq('id', orderedIds[i]);
      if (error) throw error;
    }
  }, []);

  const removeSlides = useCallback(
    async (ids: string[], confirmMessage?: string) => {
      if (ids.length === 0) return;
      if (confirmMessage && !window.confirm(confirmMessage)) return;

      try {
        const { error } = await supabaseBrowser.from('hero_slides').delete().in('id', ids);
        if (error) throw error;

        setSlides((prev) => prev.filter((slide) => !ids.includes(slide.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });

        notify('success', `${ids.length} bannière(s) supprimée(s).`);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        notify('error', `Erreur suppression: ${message}`);
        await fetchAll(false);
      }
    },
    [fetchAll, notify]
  );

  const bulkUpdateFields = useCallback(
    async (ids: string[], patch: Record<string, unknown>, successMessage: string) => {
      if (ids.length === 0) return;

      try {
        const { error } = await supabaseBrowser.from('hero_slides').update(patch).in('id', ids);
        if (error) throw error;

        setSlides((prev) =>
          prev.map((slide) => (ids.includes(slide.id) ? ({ ...slide, ...patch } as Slide) : slide))
        );

        notify('success', successMessage);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        notify('error', `Erreur mise à jour groupée: ${message}`);
        await fetchAll(false);
      }
    },
    [fetchAll, notify]
  );

  /* ───────────────────────────────────────────────────────────── */
  /*  SLIDE ACTIONS                                                */
  /* ───────────────────────────────────────────────────────────── */

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
      const ids = filteredSlides.map((slide) => slide.id);
      const everySelected = ids.length > 0 && ids.every((id) => prev.has(id));
      return everySelected ? new Set<string>() : new Set(ids);
    });
  }, [filteredSlides]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const openNewSlide = useCallback(() => {
    const newSlide: Slide = {
      id: '',
      title: '',
      highlight: '',
      description: '',
      image_url: '',
      cta_label: '',
      cta_href: '',
      is_active: true,
      sort_order: slides.length,
      start_date: null,
      end_date: null,
      image_alt: '',
      config: {
        image_alt: '',
        tags: [],
        utm: {},
        overlay_opacity: advanced.overlayOpacity,
        text_position: advanced.textPosition,
        button_variant: 'gold',
        button_size: 'lg',
        link_target: '_self',
        device_visibility: 'all',
        audience: 'all',
        approval_status: 'draft',
        priority_score: 0,
        animation_delay: 0,
      },
    };

    setEditingSlide(newSlide);
    setIsNewSlide(true);
    setEditorOpen(true);
  }, [slides.length, advanced.overlayOpacity, advanced.textPosition]);

  const openEditSlide = useCallback((slide: Slide) => {
    setEditingSlide(clone(slide));
    setIsNewSlide(false);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
    setEditingSlide(null);
    setIsNewSlide(false);
  }, []);

  const patchEditing = useCallback((patch: Partial<Slide>) => {
    setEditingSlide((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const patchEditingConfig = useCallback((patch: Partial<SlideConfig>) => {
    setEditingSlide((prev) =>
      prev
        ? {
            ...prev,
            config: {
              ...(prev.config || {}),
              ...patch,
            },
          }
        : prev
    );
  }, []);

  const setEditingAltText = useCallback((value: string) => {
    setEditingSlide((prev) =>
      prev
        ? {
            ...prev,
            image_alt: value,
            config: {
              ...(prev.config || {}),
              image_alt: value,
            },
          }
        : prev
    );
  }, []);

  const patchUtm = useCallback((key: keyof UtmParams, value: string) => {
    setEditingSlide((prev) =>
      prev
        ? {
            ...prev,
            config: {
              ...(prev.config || {}),
              utm: {
                ...(prev.config?.utm || {}),
                [key]: value,
              },
            },
          }
        : prev
    );
  }, []);

  const applyUtmToHref = useCallback(() => {
    if (!editingSlide) return;

    const nextHref = buildUtmHref(editingSlide.cta_href, editingSlide.config?.utm || {});
    if (!nextHref) {
      notify('warning', 'Impossible d’appliquer les UTM sur ce type de lien.');
      return;
    }

    patchEditing({ cta_href: nextHref });
    notify('success', 'UTM appliqués au lien.');
  }, [editingSlide, notify, patchEditing]);

  const setSchedulePreset = useCallback(
    (field: 'start_date' | 'end_date', preset: 'today' | 'tomorrow' | 'plus7' | 'plus30' | 'clear') => {
      if (!editingSlide) return;

      const date = new Date();
      let value: string | null = null;

      switch (preset) {
        case 'today':
          value = toInputDate(date);
          break;
        case 'tomorrow':
          date.setDate(date.getDate() + 1);
          value = toInputDate(date);
          break;
        case 'plus7':
          date.setDate(date.getDate() + 7);
          value = toInputDate(date);
          break;
        case 'plus30':
          date.setDate(date.getDate() + 30);
          value = toInputDate(date);
          break;
        case 'clear':
          value = null;
          break;
      }

      patchEditing({ [field]: value } as Partial<Slide>);
    },
    [editingSlide, patchEditing]
  );

  const handleEditorSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!editingSlide) return;

      const report = validateSlideDraft(editingSlide);
      if (report.errors.length > 0) {
        notify('error', report.errors[0]);
        return;
      }

      setSavingEditor(true);

      try {
        if (isNewSlide) {
          const created = await insertSlide({
            ...editingSlide,
            sort_order: editingSlide.sort_order ?? slides.length,
          });

          setSlides((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
          notify('success', 'Slide ajoutée.');
        } else {
          const updated = await updateSlide(editingSlide.id, editingSlide);
          setSlides((prev) => prev.map((slide) => (slide.id === updated.id ? updated : slide)));
          notify('success', 'Slide mise à jour.');
        }

        closeEditor();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        notify('error', `Erreur sauvegarde slide: ${message}`);
      } finally {
        setSavingEditor(false);
      }
    },
    [editingSlide, isNewSlide, insertSlide, updateSlide, slides.length, closeEditor, notify]
  );

  const toggleActiveSlide = useCallback(
    async (slide: Slide) => {
      setSavingSlideId(slide.id);
      try {
        const updated = await updateSlide(slide.id, { ...slide, is_active: !slide.is_active });
        setSlides((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        notify('success', updated.is_active ? 'Slide activée.' : 'Slide désactivée.');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        notify('error', `Erreur activation: ${message}`);
      } finally {
        setSavingSlideId(null);
      }
    },
    [updateSlide, notify]
  );

  const duplicateSlide = useCallback(
    async (slide: Slide) => {
      setSavingSlideId(slide.id);
      try {
        const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...rest } = slide;

        const copy: Slide = {
          ...(rest as Slide),
          title: `${rest.title || 'Sans titre'} (copie)`,
          is_active: false,
          sort_order: slides.length,
          config: {
            ...(rest.config || {}),
            analytics_id: undefined,
            notes: rest.config?.notes,
          },
        };

        const created = await insertSlide(copy);
        setSlides((prev) => [...prev, created].sort((a, b) => a.sort_order - b.sort_order));
        notify('success', 'Slide dupliquée.');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        notify('error', `Erreur duplication: ${message}`);
      } finally {
        setSavingSlideId(null);
      }
    },
    [insertSlide, slides.length, notify]
  );

  const deleteSlide = useCallback(
    async (id: string) => {
      await removeSlides([id], 'Supprimer cette bannière ?');
    },
    [removeSlides]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      if (!canDrag) return;

      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = slides.findIndex((slide) => slide.id === active.id);
      const newIndex = slides.findIndex((slide) => slide.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const nextSlides = arrayMove(slides, oldIndex, newIndex).map((slide, index) => ({
        ...slide,
        sort_order: index,
      }));

      setSlides(nextSlides);

      try {
        await reorderSlides(nextSlides.map((slide) => slide.id));
        notify('success', 'Ordre mis à jour.');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        notify('error', `Erreur réordonnancement: ${message}`);
        await fetchAll(false);
      }
    },
    [canDrag, slides, reorderSlides, notify, fetchAll]
  );

  const applyBulkSchedule = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const patch: Record<string, unknown> = {};
    if (bulkStartDate) patch.start_date = bulkStartDate;
    if (bulkEndDate) patch.end_date = bulkEndDate;

    if (Object.keys(patch).length === 0) {
      notify('info', 'Aucune date à appliquer.');
      return;
    }

    await bulkUpdateFields(ids, patch, 'Planning mis à jour.');
    setBulkStartDate('');
    setBulkEndDate('');
  }, [selectedIds, bulkStartDate, bulkEndDate, bulkUpdateFields, notify]);

  const applyBulkTag = useCallback(async () => {
    const tag = bulkTag.trim();
    const ids = Array.from(selectedIds);
    if (!tag || ids.length === 0) return;

    if (!hasSlideConfig) {
      setSlides((prev) =>
        prev.map((slide) =>
          ids.includes(slide.id)
            ? {
                ...slide,
                config: {
                  ...(slide.config || {}),
                  tags: mergeTags(slide.config?.tags, [tag]),
                },
              }
            : slide
        )
      );
      notify('warning', 'Colonne config absente : tag ajouté localement seulement.');
      setBulkTag('');
      return;
    }

    setSavingSlideId('bulk-tag');
    try {
      for (const id of ids) {
        const slide = slides.find((item) => item.id === id);
        if (!slide) continue;

        const tags = mergeTags(slide.config?.tags, [tag]);
        await updateSlide(id, {
          ...slide,
          config: {
            ...(slide.config || {}),
            tags,
          },
        });
      }

      notify('success', 'Tags mis à jour.');
      setBulkTag('');
      clearSelection();
      await fetchAll(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify('error', `Erreur tags: ${message}`);
      await fetchAll(false);
    } finally {
      setSavingSlideId(null);
    }
  }, [bulkTag, selectedIds, hasSlideConfig, slides, updateSlide, clearSelection, fetchAll, notify]);

  const duplicateSelected = useCallback(async () => {
    if (selectedSlides.length === 0) return;
    if (selectedSlides.length > 20) {
      notify('warning', 'Duplication limitée à 20 slides pour éviter les erreurs.');
      return;
    }

    setSavingSlideId('bulk-duplicate');
    try {
      for (const slide of selectedSlides) {
        await duplicateSlide(slide);
      }
      clearSelection();
    } finally {
      setSavingSlideId(null);
    }
  }, [selectedSlides, duplicateSlide, clearSelection, notify]);

  const exportFiltered = useCallback(() => {
    downloadJson(
      {
        exported_at: new Date().toISOString(),
        scope: 'filtered',
        settings: { basic, advanced },
        slides: filteredSlides,
      },
      `hero-carousel-filtered-${Date.now()}.json`
    );
    notify('success', 'Export filtré généré.');
  }, [basic, advanced, filteredSlides, notify]);

  const exportSelected = useCallback(() => {
    if (selectedSlides.length === 0) {
      notify('info', 'Aucune slide sélectionnée.');
      return;
    }

    downloadJson(
      {
        exported_at: new Date().toISOString(),
        scope: 'selected',
        settings: { basic, advanced },
        slides: selectedSlides,
      },
      `hero-carousel-selected-${Date.now()}.json`
    );
    notify('success', 'Export sélection généré.');
  }, [selectedSlides, basic, advanced, notify]);

  const exportAll = useCallback(() => {
    downloadJson(
      {
        exported_at: new Date().toISOString(),
        scope: 'all',
        settings: { basic, advanced },
        slides,
      },
      `hero-carousel-all-${Date.now()}.json`
    );
    notify('success', 'Export complet généré.');
  }, [basic, advanced, slides, notify]);

  const parseImport = useCallback(() => {
    try {
      const parsed = JSON.parse(importText);
      const rawSlides = Array.isArray(parsed) ? parsed : parsed.slides || [];
      const rawSettings = parsed.settings;

      const normalizedSlides = rawSlides.map(normalizeSlide);
      const normalizedSettings = rawSettings
        ? {
            basic: normalizeBasic(rawSettings.basic || rawSettings),
            advanced: normalizeAdvanced(rawSettings.advanced || rawSettings),
          }
        : undefined;

      setImportPreview({ slides: normalizedSlides, settings: normalizedSettings });
      notify('success', `${normalizedSlides.length} slide(s) prêtes à importer.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify('error', `JSON invalide: ${message}`);
      setImportPreview(null);
    }
  }, [importText, notify]);

  const applyImport = useCallback(async () => {
    if (!importPreview) return;

    setImporting(true);
    try {
      if (importPreview.settings) {
        setBasic(importPreview.settings.basic);
        setAdvanced(importPreview.settings.advanced);
      }

      for (const slide of importPreview.slides) {
        const { id: _id, created_at: _createdAt, updated_at: _updatedAt, ...rest } = slide;
        await insertSlide(rest as Slide);
      }

      notify('success', 'Import terminé.');
      setImportText('');
      setImportPreview(null);
      await fetchAll(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify('error', `Erreur import: ${message}`);
    } finally {
      setImporting(false);
    }
  }, [importPreview, insertSlide, fetchAll, notify]);

  const runImageChecks = useCallback(async () => {
    if (filteredSlides.length === 0) {
      notify('info', 'Aucune image à vérifier.');
      return;
    }

    setCheckingImages(true);
    const results: Record<string, string> = {};

    try {
      for (const slide of filteredSlides) {
        results[slide.id] = 'loading';
        setImageChecks({ ...results });

        const status = await testImageUrl(slide.image_url);
        results[slide.id] = status;
        setImageChecks({ ...results });
      }

      notify('success', 'Vérification des images terminée.');
    } finally {
      setCheckingImages(false);
    }
  }, [filteredSlides, notify]);

  const reindexSlides = useCallback(async () => {
    const ordered = [...slides].sort((a, b) => a.sort_order - b.sort_order);
    const next = ordered.map((slide, index) => ({ ...slide, sort_order: index }));

    setSlides(next);

    try {
      await reorderSlides(next.map((slide) => slide.id));
      notify('success', 'Index de tri réaligné.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      notify('error', `Erreur réindexation: ${message}`);
      await fetchAll(false);
    }
  }, [slides, reorderSlides, notify, fetchAll]);

  const cleanupExpiredInactive = useCallback(async () => {
    const ids = slides
      .filter((slide) => getSlideStatus(slide, now) === 'expired' && !slide.is_active)
      .map((slide) => slide.id);

    if (ids.length === 0) {
      notify('info', 'Aucune bannière expirée et inactive à nettoyer.');
      return;
    }

    await removeSlides(ids, `Supprimer ${ids.length} bannière(s) expirée(s) et inactive(s) ?`);
  }, [slides, now, removeSlides, notify]);

  const clearFrontCache = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem('gercie-hero-carousel-cache');
      notify('success', 'Cache local du carrousel front vidé.');
    } catch {
      notify('error', 'Impossible de vider le cache local.');
    }
  }, [notify]);

  const copySql = useCallback(async () => {
    const ok = await copyToClipboard(suggestedSql);
    notify(ok ? 'success' : 'error', ok ? 'SQL copié.' : 'Impossible de copier le SQL.');
  }, [suggestedSql, notify]);

  /* ───────────────────────────────────────────────────────────── */
  /*  EFFECTS: DIRTY, AUTOSAVE, SHORTCUTS                          */
  /* ───────────────────────────────────────────────────────────── */

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isSettingsDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isSettingsDirty]);

  useEffect(() => {
    if (!autoSave || !isSettingsDirty) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    autoSaveTimerRef.current = setTimeout(() => {
      void saveSettings();
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [autoSave, isSettingsDirty, saveSettings]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const mod = isMac ? event.metaKey : event.ctrlKey;

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveSettings();
      }

      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setActiveTab('slides');
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }

      if (event.key === 'Escape' && editorOpen) {
        closeEditor();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveSettings, editorOpen, closeEditor]);

  /* ───────────────────────────────────────────────────────────── */
  /*  PREVIEW DATA                                                 */
  /* ───────────────────────────────────────────────────────────── */

  const previewSlidesRaw = useMemo(() => {
    let source: Slide[] = [];

    switch (previewScope) {
      case 'all':
        source = slides;
        break;
      case 'active':
        source = slides.filter((slide) => getSlideStatus(slide, now) === 'active');
        break;
      case 'filtered':
        source = filteredSlides;
        break;
      case 'selected':
        source = selectedSlides;
        break;
    }

    if (!previewIncludeExpired) {
      source = source.filter((slide) => getSlideStatus(slide, now) !== 'expired');
    }

    return source;
  }, [previewScope, slides, filteredSlides, selectedSlides, now, previewIncludeExpired]);

  const previewSlides = useMemo(
    () =>
      previewSlidesRaw.map((slide) => ({
        id: slide.id,
        title: slide.title,
        highlight: slide.highlight,
        description: slide.description,
        image_url: slide.image_url,
        cta_label: slide.cta_label,
        cta_href: slide.cta_href,
        image_alt: slide.image_alt || slide.config?.image_alt || slide.title,
      })),
    [previewSlidesRaw]
  );

  const editorReport = useMemo(() => validateSlideDraft(editingSlide), [editingSlide]);

  /* ───────────────────────────────────────────────────────────── */
  /*  RENDER                                                       */
  /* ───────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <ToastProvider>
      <div className="min-h-screen space-y-6 bg-neutral-950 p-4 text-white md:p-6">
        {/* HEADER */}
        <header className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <h1 className="flex items-center gap-2 text-2xl font-bold font-serif text-gold-400 md:text-3xl">
                <Layers size={26} />
                Gestionnaire Hero Carrousel
              </h1>
              <p className="text-sm text-neutral-400">
                Paramètres globaux, bannières, planification, drag & drop, aperçu, outils avancés, export/import, validation et persistance adaptative.
              </p>

              <div className="flex flex-wrap gap-2">
                <MiniBadge tone={isSettingsDirty ? 'gold' : 'green'}>
                  {isSettingsDirty ? <Save size={10} /> : <Check size={10} />}
                  {isSettingsDirty ? 'Modifications non enregistrées' : 'Paramètres synchronisés'}
                </MiniBadge>

                <MiniBadge tone={hasSettingsOptions ? 'green' : 'red'}>
                  <Database size={10} />
                  options {hasSettingsOptions ? 'OK' : 'absente'}
                </MiniBadge>

                <MiniBadge tone={hasSlideConfig ? 'green' : 'red'}>
                  <Database size={10} />
                  config {hasSlideConfig ? 'OK' : 'absente'}
                </MiniBadge>

                <MiniBadge>
                  <ListChecks size={10} />
                  {slides.length} slide(s)
                </MiniBadge>

                {autoSave ? (
                  <MiniBadge tone="blue">
                    <RefreshCw size={10} />
                    Auto-save
                  </MiniBadge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => void fetchAll()} disabled={loading}>
                <RefreshCw size={16} className="mr-2" />
                Actualiser
              </Button>

              <Button variant={autoSave ? 'gold' : 'outline'} onClick={() => setAutoSave((prev) => !prev)}>
                {autoSave ? <Pause size={16} className="mr-2" /> : <Play size={16} className="mr-2" />}
                Auto-save {autoSave ? 'ON' : 'OFF'}
              </Button>

              <Button variant="gold" onClick={() => void saveSettings()} disabled={savingSettings || !isSettingsDirty}>
                {savingSettings ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                Enregistrer
              </Button>
            </div>
          </div>

          {loadError ? (
            <div className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">Erreur de chargement</p>
                <p className="text-red-300/90">{loadError}</p>
              </div>
            </div>
          ) : null}
        </header>

        {/* TABS */}
        <nav className="flex gap-2 overflow-x-auto pb-1">
          {[
            { id: 'settings', label: 'Paramètres', icon: <Settings size={16} /> },
            { id: 'slides', label: `Bannières (${slides.length})`, icon: <Layers size={16} /> },
            { id: 'preview', label: 'Aperçu', icon: <Eye size={16} /> },
            { id: 'tools', label: 'Outils', icon: <Wand2 size={16} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cx(
                'inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition',
                activeTab === tab.id
                  ? 'border-gold-400/50 bg-gold-500/15 text-gold-200'
                  : 'border-white/10 bg-black/30 text-neutral-300 hover:border-white/20 hover:text-white'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* SETTINGS TAB */}
        {activeTab === 'settings' ? (
          <div className="space-y-6">
            <section className={cardClass}>
              <SectionTitle
                icon={<Settings size={18} />}
                title="Paramètres de base"
                subtitle="Ces champs correspondent aux colonnes standards de hero_settings."
              />

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className={labelClass}>Sens de défilement</label>
                  <select
                    value={basic.direction}
                    onChange={(event) => patchBasic({ direction: event.target.value as Direction })}
                    className={selectClass}
                  >
                    <option value="horizontal">Horizontal (Gauche → Droite)</option>
                    <option value="vertical">Vertical (Bas → Haut)</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Intervalle (ms)</label>
                  <Input
                    type="number"
                    min={1000}
                    max={120000}
                    step={500}
                    value={basic.interval_ms}
                    onChange={(event) => patchBasic({ interval_ms: clamp(Number(event.target.value) || 5000, 1000, 120000) })}
                    placeholder="5000"
                  />
                  <div className="mt-2 flex flex-wrap gap-1">
                    {[3000, 5000, 7000, 10000].map((ms) => (
                      <button
                        key={ms}
                        type="button"
                        onClick={() => patchBasic({ interval_ms: ms })}
                        className={cx(
                          'rounded-full border px-2 py-1 text-[10px] transition',
                          basic.interval_ms === ms
                            ? 'border-gold-400/50 bg-gold-500/15 text-gold-200'
                            : 'border-white/10 bg-black/30 text-neutral-300 hover:text-white'
                        )}
                      >
                        {ms / 1000}s
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Autoplay</label>
                  <select
                    value={basic.autoplay_enabled ? 'true' : 'false'}
                    onChange={(event) => patchBasic({ autoplay_enabled: event.target.value === 'true' })}
                    className={selectClass}
                  >
                    <option value="true">Activé</option>
                    <option value="false">Désactivé</option>
                  </select>
                </div>

                <div className="flex items-end gap-2">
                  <Button variant="gold" onClick={() => void saveSettings()} disabled={savingSettings || !isSettingsDirty} className="h-10 flex-1">
                    <Save size={16} className="mr-2" />
                    Sauvegarder
                  </Button>
                  <Button variant="outline" onClick={resetSettingsToDefaults} className="h-10">
                    <RefreshCw size={16} />
                  </Button>
                </div>
              </div>
            </section>

            <details className={cardClass} open>
              <summary className="cursor-pointer list-none">
                <SectionTitle
                  icon={<Sparkles size={18} />}
                  title="Options avancées globales"
                  subtitle="Persistées dans hero_settings.options si la colonne JSONB existe."
                />
              </summary>

              <div className="mt-5 space-y-5">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-neutral-400">Affichage</p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Toggle label="Barre de progression" checked={advanced.showProgress} onChange={(v) => patchAdvanced({ showProgress: v })} icon={<Clock size={14} />} />
                    <Toggle label="Compteur de slides" checked={advanced.showCounter} onChange={(v) => patchAdvanced({ showCounter: v })} icon={<ListChecks size={14} />} />
                    <Toggle label="Plein écran" checked={advanced.enableFullscreen} onChange={(v) => patchAdvanced({ enableFullscreen: v })} icon={<Maximize2 size={14} />} />
                    <Toggle label="Désactiver autoplay mobile" checked={advanced.disableAutoplayOnMobile} onChange={(v) => patchAdvanced({ disableAutoplayOnMobile: v })} icon={<MonitorSmartphone size={14} />} />
                    <Toggle label="Contrôles mobiles" checked={advanced.showMobileControls} onChange={(v) => patchAdvanced({ showMobileControls: v })} icon={<MonitorSmartphone size={14} />} />
                    <Toggle label="Personnalisation IA" checked={advanced.personalized} onChange={(v) => patchAdvanced({ personalized: v })} icon={<Sparkles size={14} />} hint="Active la slide recommandée si l’API IA est disponible." />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-neutral-400">Comportement</p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <Toggle label="Pause au survol" checked={advanced.pauseOnHover} onChange={(v) => patchAdvanced({ pauseOnHover: v })} icon={<Pause size={14} />} />
                    <Toggle label="Boucle infinie" checked={advanced.loop} onChange={(v) => patchAdvanced({ loop: v })} icon={<RefreshCw size={14} />} />
                    <Toggle label="Swipe tactile" checked={advanced.swipeEnabled} onChange={(v) => patchAdvanced({ swipeEnabled: v })} icon={<ExternalLink size={14} />} />
                    <Toggle label="Navigation clavier" checked={advanced.keyboardEnabled} onChange={(v) => patchAdvanced({ keyboardEnabled: v })} icon={<Keyboard size={14} />} />
                    <Toggle label="Intervalle adaptatif" checked={advanced.adaptiveInterval} onChange={(v) => patchAdvanced({ adaptiveInterval: v })} icon={<ZapLikeIcon />} />
                    <Toggle label="Priorité haute d’abord" checked={advanced.highPriorityFirst} onChange={(v) => patchAdvanced({ highPriorityFirst: v })} icon={<Star size={14} />} />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-neutral-400">Animation & rendu</p>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label className={labelClass}>Variante d’animation</label>
                      <select
                        value={advanced.animationVariant}
                        onChange={(event) => patchAdvanced({ animationVariant: event.target.value as AnimationVariant })}
                        className={selectClass}
                      >
                        {ANIMATION_VARIANTS.map((variant) => (
                          <option key={variant} value={variant}>
                            {variant}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={labelClass}>Position texte</label>
                      <select
                        value={advanced.textPosition}
                        onChange={(event) => patchAdvanced({ textPosition: event.target.value as TextPosition })}
                        className={selectClass}
                      >
                        {TEXT_POSITIONS.map((position) => (
                          <option key={position} value={position}>
                            {position}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={labelClass}>Durée transition (s)</label>
                      <Input
                        type="number"
                        min={0}
                        max={3}
                        step={0.1}
                        value={advanced.transitionDuration}
                        onChange={(event) => patchAdvanced({ transitionDuration: clamp(Number(event.target.value) || 0.5, 0, 3) })}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Préchargement slides</label>
                      <Input
                        type="number"
                        min={0}
                        max={10}
                        step={1}
                        value={advanced.preloadSlides}
                        onChange={(event) => patchAdvanced({ preloadSlides: clamp(Number(event.target.value) || 2, 0, 10) })}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className={labelClass}>Opacité overlay : {advanced.overlayOpacity}%</label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={advanced.overlayOpacity}
                      onChange={(event) => patchAdvanced({ overlayOpacity: Number(event.target.value) })}
                      className="w-full accent-gold-500"
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-neutral-400">Cache & refresh</p>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <label className={labelClass}>Cache TTL (minutes)</label>
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        value={advanced.cacheTTL}
                        onChange={(event) => patchAdvanced({ cacheTTL: clamp(Number(event.target.value) || 5, 0, 120) })}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Auto refresh (secondes, 0 = off)</label>
                      <Input
                        type="number"
                        min={0}
                        max={3600}
                        value={advanced.autoRefreshInterval}
                        onChange={(event) => patchAdvanced({ autoRefreshInterval: clamp(Number(event.target.value) || 0, 0, 3600) })}
                      />
                    </div>

                    <div className="flex items-end">
                      <Toggle label="Accessibilité live" checked={advanced.accessibilityLive} onChange={(v) => patchAdvanced({ accessibilityLive: v })} icon={<ShieldCheck size={14} />} />
                    </div>

                    <div className="flex items-end">
                      <Toggle label="Fallback reduced motion" checked={advanced.reduceMotionFallback} onChange={(v) => patchAdvanced({ reduceMotionFallback: v })} icon={<Eye size={14} />} />
                    </div>
                  </div>
                </div>
              </div>
            </details>
          </div>
        ) : null}

        {/* SLIDES TAB */}
        {activeTab === 'slides' ? (
          <div className="space-y-5">
            {/* TOOLBAR */}
            <div className={cardClass}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <SectionTitle icon={<Layers size={18} />} title="Bannières" subtitle="Recherche, filtres, sélection multiple, drag & drop, actions groupées." />

                <div className="flex flex-wrap gap-2">
                  <Button variant="gold" onClick={openNewSlide}>
                    <Plus size={16} className="mr-2" />
                    Nouvelle bannière
                  </Button>
                  <Button variant="outline" onClick={toggleSelectAll}>
                    <Check size={16} className="mr-2" />
                    {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </Button>
                  <Button variant="outline" onClick={exportFiltered}>
                    <Download size={16} className="mr-2" />
                    Export filtré
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <div className="xl:col-span-2">
                  <label className={labelClass}>Recherche</label>
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      ref={searchInputRef}
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Titre, description, tag, lien..."
                      className={cx(inputClass, 'pl-9')}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Statut</label>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className={selectClass}>
                    <option value="all">Tous</option>
                    <option value="active">Actives</option>
                    <option value="scheduled">Programmées</option>
                    <option value="expired">Expirées</option>
                    <option value="inactive">Inactives</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Tag</label>
                  <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} className={selectClass}>
                    <option value="all">Tous</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>
                        {tag}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Tri</label>
                  <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className={selectClass}>
                    <option value="order">Ordre manuel</option>
                    <option value="title">Titre A→Z</option>
                    <option value="start">Date de début</option>
                    <option value="status">Statut</option>
                  </select>
                </div>
              </div>

              {!canDrag ? (
                <div className="flex items-start gap-2 rounded-xl border border-blue-500/20 bg-blue-500/10 p-3 text-xs text-blue-200">
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <p>Le drag & drop est désactivé quand un filtre ou un tri autre que “Ordre manuel” est actif.</p>
                </div>
              ) : null}
            </div>

            {/* BULK BAR */}
            {selectedIds.size > 0 ? (
              <div className="sticky top-2 z-30 space-y-3 rounded-2xl border border-gold-500/30 bg-black/85 p-4 backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gold-200">
                    <ListChecks size={16} />
                    {selectedIds.size} sélectionnée(s)
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void bulkUpdateFields(Array.from(selectedIds), { is_active: true }, 'Slides activées.')}>
                      <Power size={14} className="mr-2" />
                      Activer
                    </Button>
                    <Button variant="outline" onClick={() => void bulkUpdateFields(Array.from(selectedIds), { is_active: false }, 'Slides désactivées.')}>
                      <EyeOff size={14} className="mr-2" />
                      Désactiver
                    </Button>
                    <Button variant="outline" onClick={() => void duplicateSelected()} disabled={savingSlideId === 'bulk-duplicate'}>
                      <Copy size={14} className="mr-2" />
                      Dupliquer
                    </Button>
                    <Button variant="outline" onClick={exportSelected}>
                      <Download size={14} className="mr-2" />
                      Exporter
                    </Button>
                    <Button variant="outline" onClick={() => void removeSlides(Array.from(selectedIds), `Supprimer ${selectedIds.size} bannière(s) ?`)}>
                      <Trash2 size={14} className="mr-2" />
                      Supprimer
                    </Button>
                    <Button variant="outline" onClick={clearSelection}>
                      <X size={14} className="mr-2" />
                      Clear
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div>
                    <label className={labelClass}>Début groupé</label>
                    <Input type="date" value={bulkStartDate} onChange={(event) => setBulkStartDate(event.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>Fin groupée</label>
                    <Input type="date" value={bulkEndDate} onChange={(event) => setBulkEndDate(event.target.value)} />
                  </div>
                  <div className="flex items-end">
                    <Button variant="gold" onClick={() => void applyBulkSchedule()} className="h-10 w-full">
                      <Calendar size={14} className="mr-2" />
                      Appliquer dates
                    </Button>
                  </div>
                  <div>
                    <label className={labelClass}>Tag groupé</label>
                    <Input value={bulkTag} onChange={(event) => setBulkTag(event.target.value)} placeholder="promo, nouveau, saison" />
                  </div>
                  <div className="flex items-end">
                    <Button variant="gold" onClick={() => void applyBulkTag()} disabled={savingSlideId === 'bulk-tag'} className="h-10 w-full">
                      <Tag size={14} className="mr-2" />
                      Appliquer tag
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            {/* LIST */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filteredSlides.map((slide) => slide.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {filteredSlides.map((slide, index) => (
                    <SortableSlideRow
                      key={slide.id}
                      slide={slide}
                      index={index}
                      isSelected={selectedIds.has(slide.id)}
                      canDrag={canDrag}
                      isSaving={savingSlideId === slide.id}
                      now={now}
                      imageStatus={imageChecks[slide.id]}
                      onSelect={toggleSelect}
                      onEdit={openEditSlide}
                      onDuplicate={duplicateSlide}
                      onDelete={deleteSlide}
                      onToggleActive={toggleActiveSlide}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {filteredSlides.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center">
                <p className="text-lg font-medium text-neutral-300">Aucune bannière trouvée</p>
                <p className="mt-1 text-sm text-neutral-500">Modifie les filtres ou crée une nouvelle slide.</p>
                <Button variant="gold" onClick={openNewSlide} className="mt-4">
                  <Plus size={16} className="mr-2" />
                  Créer une bannière
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* PREVIEW TAB */}
        {activeTab === 'preview' ? (
          <div className="space-y-5">
            <div className={cardClass}>
              <SectionTitle icon={<Eye size={18} />} title="Aperçu du carrousel" subtitle="Teste le rendu avant publication. L’aperçu réel utilise HeroCarousel si les contextes sont disponibles." />

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className={labelClass}>Source</label>
                  <select value={previewScope} onChange={(event) => setPreviewScope(event.target.value as typeof previewScope)} className={selectClass}>
                    <option value="all">Toutes</option>
                    <option value="active">Actives</option>
                    <option value="filtered">Filtrées</option>
                    <option value="selected">Sélectionnées</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <Toggle label="Inclure expirées" checked={previewIncludeExpired} onChange={setPreviewIncludeExpired} icon={<Clock size={14} />} />
                </div>

                <div className="flex items-end">
                  <Toggle label="Autoplay" checked={basic.autoplay_enabled} onChange={(v) => patchBasic({ autoplay_enabled: v })} icon={<Play size={14} />} />
                </div>

                <div className="flex items-end">
                  <Toggle label="Personnalisé IA" checked={advanced.personalized} onChange={(v) => patchAdvanced({ personalized: v })} icon={<Sparkles size={14} />} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <MiniBadge>{previewSlides.length} slide(s) aperçues</MiniBadge>
                <MiniBadge tone="gold">{basic.direction}</MiniBadge>
                <MiniBadge>{basic.interval_ms} ms</MiniBadge>
                <MiniBadge>{advanced.animationVariant}</MiniBadge>
                <MiniBadge>{advanced.textPosition}</MiniBadge>
              </div>
            </div>

            {previewSlides.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-black/30 p-10 text-center text-neutral-400">
                Aucune slide à prévisualiser.
              </div>
            ) : (
              <PreviewErrorBoundary
                fallback={
                  <SimplePreview
                    slides={previewSlides}
                    intervalMs={basic.interval_ms}
                    autoplayEnabled={basic.autoplay_enabled}
                    showProgress={advanced.showProgress}
                    showCounter={advanced.showCounter}
                    disableAutoplayOnMobile={advanced.disableAutoplayOnMobile}
                  />
                }
              >
                <div key={`${previewSlides.map((s) => s.id).join('-')}-${basic.direction}-${basic.interval_ms}-${advanced.animationVariant}`}>
                  <HeroCarousel
                    slides={previewSlides}
                    direction={basic.direction}
                    intervalMs={basic.interval_ms}
                    autoplayEnabled={basic.autoplay_enabled}
                    showProgress={advanced.showProgress}
                    showCounter={advanced.showCounter}
                    enableFullscreen={advanced.enableFullscreen}
                    disableAutoplayOnMobile={advanced.disableAutoplayOnMobile}
                    personalized={advanced.personalized}
                  />
                </div>
              </PreviewErrorBoundary>
            )}
          </div>
        ) : null}

        {/* TOOLS TAB */}
        {activeTab === 'tools' ? (
          <div className="grid gap-5 xl:grid-cols-2">
            <section className={cardClass}>
              <SectionTitle icon={<Database size={18} />} title="Diagnostic base de données" subtitle="Détecte les colonnes supportées et propose la migration manquante." />

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <MiniBadge tone={hasSettingsOptions ? 'green' : 'red'}>hero_settings.options</MiniBadge>
                  <MiniBadge tone={hasSlideConfig ? 'green' : 'red'}>hero_slides.config</MiniBadge>
                  <MiniBadge tone={supportedSlideColumns.has('image_alt') ? 'green' : 'red'}>hero_slides.image_alt</MiniBadge>
                </div>

                {systemWarnings.length > 0 ? (
                  <ul className="space-y-2 text-sm text-amber-200">
                    {systemWarnings.map((warning) => (
                      <li key={warning} className="flex items-start gap-2">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <span>{warning}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-emerald-300">
                    <Check size={16} />
                    Toutes les colonnes avancées nécessaires sont détectées.
                  </div>
                )}

                <div>
                  <label className={labelClass}>SQL suggéré</label>
                  <textarea readOnly value={suggestedSql} className={cx(textareaClass, 'min-h-[220px] font-mono text-xs')} />
                  <Button variant="outline" onClick={() => void copySql()} className="mt-2">
                    <Copy size={14} className="mr-2" />
                    Copier le SQL
                  </Button>
                </div>
              </div>
            </section>

            <section className={cardClass}>
              <SectionTitle icon={<ShieldCheck size={18} />} title="Vérification images" subtitle="Teste les URLs des slides filtrées pour détecter images cassées ou lentes." />

              <div className="space-y-3">
                <Button variant="gold" onClick={() => void runImageChecks()} disabled={checkingImages}>
                  {checkingImages ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />}
                  Vérifier {filteredSlides.length} image(s)
                </Button>

                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {filteredSlides.map((slide) => {
                    const status = imageChecks[slide.id];
                    return (
                      <div key={slide.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-2 text-xs">
                        <span className="min-w-0 truncate text-neutral-300">{slide.title || slide.id}</span>
                        <MiniBadge tone={status === 'ok' ? 'green' : status === 'error' ? 'red' : status === 'timeout' ? 'gold' : 'neutral'}>
                          {status || 'idle'}
                        </MiniBadge>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className={cardClass}>
              <SectionTitle icon={<FileJson size={18} />} title="Export / Import" subtitle="Sauvegarde JSON complète ou partielle, import dans la base." />

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={exportAll}>
                    <Download size={14} className="mr-2" />
                    Export tout
                  </Button>
                  <Button variant="outline" onClick={exportFiltered}>
                    <Download size={14} className="mr-2" />
                    Export filtré
                  </Button>
                  <Button variant="outline" onClick={exportSelected} disabled={selectedSlides.length === 0}>
                    <Download size={14} className="mr-2" />
                    Export sélection
                  </Button>
                </div>

                <div>
                  <label className={labelClass}>Coller un JSON d’import</label>
                  <textarea
                    value={importText}
                    onChange={(event) => setImportText(event.target.value)}
                    placeholder='{ "settings": { ... }, "slides": [ ... ] }'
                    className={cx(textareaClass, 'min-h-[160px] font-mono text-xs')}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="gold" onClick={parseImport} disabled={!importText.trim()}>
                    <Check size={14} className="mr-2" />
                    Valider import
                  </Button>
                  <Button variant="luxe" onClick={() => void applyImport()} disabled={!importPreview || importing}>
                    {importing ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Upload size={14} className="mr-2" />}
                    Importer {importPreview?.slides.length || 0} slide(s)
                  </Button>
                  <Button variant="outline" onClick={() => { setImportText(''); setImportPreview(null); }}>
                    <X size={14} className="mr-2" />
                    Clear
                  </Button>
                </div>

                {importPreview ? (
                  <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs">
                    <p className="font-semibold text-white">Aperçu import</p>
                    <p className="mt-1 text-neutral-400">{importPreview.slides.length} slide(s), settings {importPreview.settings ? 'inclus' : 'absents'}.</p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className={cardClass}>
              <SectionTitle icon={<Wand2 size={18} />} title="Maintenance" subtitle="Actions techniques utiles pour garder le carrousel propre." />

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => void reindexSlides()}>
                    <ListChecks size={14} className="mr-2" />
                    Réindexer sort_order
                  </Button>
                  <Button variant="outline" onClick={() => void cleanupExpiredInactive()}>
                    <Trash2 size={14} className="mr-2" />
                    Nettoyer expirées inactives
                  </Button>
                  <Button variant="outline" onClick={clearFrontCache}>
                    <RefreshCw size={14} className="mr-2" />
                    Vider cache front
                  </Button>
                  <Button variant="outline" onClick={() => void fetchAll()}>
                    <Database size={14} className="mr-2" />
                    Recharger données
                  </Button>
                </div>

                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-200">
                  <p className="font-semibold">Zone sensible</p>
                  <p className="mt-1 text-red-300/80">
                    La suppression groupée et le nettoyage sont irréversibles. Exporte toujours avant.
                  </p>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {/* EDITOR MODAL */}
        {editorOpen && editingSlide ? (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm md:p-6">
            <form
              onSubmit={handleEditorSubmit}
              className="my-4 w-full max-w-6xl space-y-5 rounded-3xl border border-gold-400/20 bg-neutral-950 p-4 shadow-2xl md:p-6"
            >
              {/* Editor header */}
              <div className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-bold text-white">
                    <Pencil size={18} className="text-gold-400" />
                    {isNewSlide ? 'Nouvelle bannière' : 'Éditer la bannière'}
                  </h2>
                  <p className="mt-1 text-xs text-neutral-400">
                    ID: {editingSlide.id || 'nouvelle'} · Ordre: {editingSlide.sort_order} · Statut: {statusLabel(getSlideStatus(editingSlide, now))}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <MiniBadge tone={editorReport.score >= 90 ? 'green' : editorReport.score >= 70 ? 'gold' : 'red'}>
                    <ShieldCheck size={12} />
                    Score {editorReport.score}
                  </MiniBadge>

                  <Button type="button" variant="outline" onClick={closeEditor}>
                    <X size={16} className="mr-2" />
                    Fermer
                  </Button>

                  <Button type="submit" variant="gold" disabled={savingEditor}>
                    {savingEditor ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Save size={16} className="mr-2" />}
                    Enregistrer
                  </Button>
                </div>
              </div>

              {/* Validation */}
              {editorReport.errors.length > 0 || editorReport.warnings.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {editorReport.errors.length > 0 ? (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                      <p className="mb-2 flex items-center gap-2 font-semibold">
                        <AlertTriangle size={14} /> Erreurs bloquantes
                      </p>
                      <ul className="list-disc space-y-1 pl-5 text-xs">
                        {editorReport.errors.map((error) => (
                          <li key={error}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {editorReport.warnings.length > 0 ? (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                      <p className="mb-2 flex items-center gap-2 font-semibold">
                        <Info size={14} /> Avertissements
                      </p>
                      <ul className="list-disc space-y-1 pl-5 text-xs">
                        {editorReport.warnings.map((warning) => (
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
                {/* LEFT COLUMN */}
                <div className="space-y-5 xl:col-span-2">
                  <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
                    <SectionTitle icon={<Layers size={16} />} title="Contenu principal" />

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>
                          Titre * <span className="text-neutral-500">({editingSlide.title.length}/80)</span>
                        </label>
                        <Input value={editingSlide.title} onChange={(event) => patchEditing({ title: event.target.value })} placeholder="Titre principal" maxLength={120} />
                      </div>

                      <div>
                        <label className={labelClass}>
                          Surlignage <span className="text-neutral-500">({editingSlide.highlight.length}/40)</span>
                        </label>
                        <Input value={editingSlide.highlight} onChange={(event) => patchEditing({ highlight: event.target.value })} placeholder="-20%, Nouveau, Offre limitée..." maxLength={80} />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>
                        Description <span className="text-neutral-500">({editingSlide.description.length}/180)</span>
                      </label>
                      <textarea
                        value={editingSlide.description}
                        onChange={(event) => patchEditing({ description: event.target.value })}
                        placeholder="Description courte et persuasive"
                        className={textareaClass}
                        maxLength={300}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>Texte du bouton</label>
                        <Input value={editingSlide.cta_label} onChange={(event) => patchEditing({ cta_label: event.target.value })} placeholder="Découvrir, Réserver, Voir le produit" maxLength={50} />
                      </div>

                      <div>
                        <label className={labelClass}>Lien du bouton</label>
                        <Input value={editingSlide.cta_href} onChange={(event) => patchEditing({ cta_href: event.target.value })} placeholder="/produits/... ou https://..." />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Toggle label="Active" checked={editingSlide.is_active} onChange={(v) => patchEditing({ is_active: v })} icon={<Power size={14} />} />
                      <div>
                        <label className={labelClass}>Statut validation</label>
                        <select
                          value={editingSlide.config?.approval_status || 'draft'}
                          onChange={(event) => patchEditingConfig({ approval_status: event.target.value as ApprovalStatus })}
                          className={cx(selectClass, 'h-10')}
                        >
                          {APPROVAL_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
                    <SectionTitle icon={<Eye size={16} />} title="Images & médias" subtitle="Format recommandé 2:1. Tu peux aussi définir des variantes mobile/desktop dans config." />

                    <div>
                      <label className={labelClass}>URL image principale *</label>
                      <Input value={editingSlide.image_url} onChange={(event) => patchEditing({ image_url: event.target.value })} placeholder="https://... ou /images/..." />
                    </div>

                    <ImageUpload
                      onUploadComplete={(url) => patchEditing({ image_url: url })}
                      folder="hero"
                      aspectRatio={2}
                      maxSizeMB={5}
                    />

                    {editingSlide.image_url ? (
                      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
                        <img src={editingSlide.image_url} alt={editingSlide.image_alt || editingSlide.title} className="h-full w-full object-cover" />
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>Texte alternatif (accessibilité)</label>
                        <Input
                          value={editingSlide.image_alt || editingSlide.config?.image_alt || ''}
                          onChange={(event) => setEditingAltText(event.target.value)}
                          placeholder="Décris l’image pour les lecteurs d’écran"
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Image mobile (optionnelle)</label>
                        <Input
                          value={editingSlide.config?.mobile_image_url || ''}
                          onChange={(event) => patchEditingConfig({ mobile_image_url: event.target.value })}
                          placeholder="URL image mobile"
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Image desktop (optionnelle)</label>
                        <Input
                          value={editingSlide.config?.desktop_image_url || ''}
                          onChange={(event) => patchEditingConfig({ desktop_image_url: event.target.value })}
                          placeholder="URL image desktop"
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Vidéo background (optionnelle)</label>
                        <Input
                          value={editingSlide.config?.video_url || ''}
                          onChange={(event) => patchEditingConfig({ video_url: event.target.value })}
                          placeholder="mp4/webm"
                        />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
                    <SectionTitle icon={<Link2 size={16} />} title="Lien, UTM & ciblage" />

                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <label className={labelClass}>Ouverture lien</label>
                        <select
                          value={editingSlide.config?.link_target || '_self'}
                          onChange={(event) => patchEditingConfig({ link_target: event.target.value as '_self' | '_blank' })}
                          className={selectClass}
                        >
                          <option value="_self">Même onglet</option>
                          <option value="_blank">Nouvel onglet</option>
                        </select>
                      </div>

                      <div>
                        <label className={labelClass}>Appareil</label>
                        <select
                          value={editingSlide.config?.device_visibility || 'all'}
                          onChange={(event) => patchEditingConfig({ device_visibility: event.target.value as DeviceVisibility })}
                          className={selectClass}
                        >
                          {DEVICE_VISIBILITIES.map((device) => (
                            <option key={device} value={device}>
                              {device}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={labelClass}>Audience</label>
                        <select
                          value={editingSlide.config?.audience || 'all'}
                          onChange={(event) => patchEditingConfig({ audience: event.target.value as Audience })}
                          className={selectClass}
                        >
                          {AUDIENCES.map((audience) => (
                            <option key={audience} value={audience}>
                              {audience}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <details className="rounded-xl border border-white/10 bg-black/30 p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-white">UTM Builder</summary>

                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div>
                          <label className={labelClass}>utm_source</label>
                          <Input value={editingSlide.config?.utm?.utm_source || ''} onChange={(event) => patchUtm('utm_source', event.target.value)} placeholder="newsletter, homepage" />
                        </div>
                        <div>
                          <label className={labelClass}>utm_medium</label>
                          <Input value={editingSlide.config?.utm?.utm_medium || ''} onChange={(event) => patchUtm('utm_medium', event.target.value)} placeholder="banner, carousel" />
                        </div>
                        <div>
                          <label className={labelClass}>utm_campaign</label>
                          <Input value={editingSlide.config?.utm?.utm_campaign || ''} onChange={(event) => patchUtm('utm_campaign', event.target.value)} placeholder="summer-sale" />
                        </div>
                        <div>
                          <label className={labelClass}>utm_term</label>
                          <Input value={editingSlide.config?.utm?.utm_term || ''} onChange={(event) => patchUtm('utm_term', event.target.value)} placeholder="perfume" />
                        </div>
                        <div>
                          <label className={labelClass}>utm_content</label>
                          <Input value={editingSlide.config?.utm?.utm_content || ''} onChange={(event) => patchUtm('utm_content', event.target.value)} placeholder="slide-1" />
                        </div>
                        <div className="flex items-end">
                          <Button type="button" variant="gold" onClick={applyUtmToHref} className="h-10 w-full">
                            <Wand2 size={14} className="mr-2" />
                            Appliquer UTM
                          </Button>
                        </div>
                      </div>
                    </details>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>Tags (séparés par virgules)</label>
                        <Input
                          value={(editingSlide.config?.tags || []).join(', ')}
                          onChange={(event) => patchEditingConfig({ tags: parseTags(event.target.value) })}
                          placeholder="promo, nouveau, parfum"
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Analytics ID</label>
                        <Input value={editingSlide.config?.analytics_id || ''} onChange={(event) => patchEditingConfig({ analytics_id: event.target.value })} placeholder="hero_promo_2026" />
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
                    <SectionTitle icon={<Calendar size={16} />} title="Planification" subtitle="Dates optionnelles. Laisse vide pour permanent." />

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>Date de début</label>
                        <Input type="date" value={editingSlide.start_date?.split('T')[0] || ''} onChange={(event) => patchEditing({ start_date: event.target.value || null })} />
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(['today', 'tomorrow', 'plus7', 'plus30', 'clear'] as const).map((preset) => (
                            <button
                              key={`start-${preset}`}
                              type="button"
                              onClick={() => setSchedulePreset('start_date', preset)}
                              className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-neutral-300 hover:text-white"
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Date de fin</label>
                        <Input type="date" value={editingSlide.end_date?.split('T')[0] || ''} onChange={(event) => patchEditing({ end_date: event.target.value || null })} />
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(['today', 'tomorrow', 'plus7', 'plus30', 'clear'] as const).map((preset) => (
                            <button
                              key={`end-${preset}`}
                              type="button"
                              onClick={() => setSchedulePreset('end_date', preset)}
                              className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-neutral-300 hover:text-white"
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 text-xs">
                      <MiniBadge tone="blue">
                        <Clock size={10} /> Début: {formatDate(editingSlide.start_date)}
                      </MiniBadge>
                      <MiniBadge tone="gold">
                        <Calendar size={10} /> Fin: {formatDate(editingSlide.end_date)}
                      </MiniBadge>
                      <StatusBadge status={getSlideStatus(editingSlide, now)} />
                    </div>
                  </section>
                </div>

                {/* RIGHT COLUMN */}
                <div className="space-y-5">
                  <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
                    <SectionTitle icon={<Sparkles size={16} />} title="Apparence slide" />

                    <div>
                      <label className={labelClass}>Overlay : {editingSlide.config?.overlay_opacity ?? advanced.overlayOpacity}%</label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={editingSlide.config?.overlay_opacity ?? advanced.overlayOpacity}
                        onChange={(event) => patchEditingConfig({ overlay_opacity: Number(event.target.value) })}
                        className="w-full accent-gold-500"
                      />
                    </div>

                    <div className="grid gap-3">
                      <div>
                        <label className={labelClass}>Position texte</label>
                        <select
                          value={editingSlide.config?.text_position || advanced.textPosition}
                          onChange={(event) => patchEditingConfig({ text_position: event.target.value as TextPosition })}
                          className={selectClass}
                        >
                          {TEXT_POSITIONS.map((position) => (
                            <option key={position} value={position}>
                              {position}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={labelClass}>Bouton variante</label>
                        <select
                          value={editingSlide.config?.button_variant || 'gold'}
                          onChange={(event) => patchEditingConfig({ button_variant: event.target.value as ButtonVariant })}
                          className={selectClass}
                        >
                          {BUTTON_VARIANTS.map((variant) => (
                            <option key={variant} value={variant}>
                              {variant}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={labelClass}>Bouton taille</label>
                        <select
                          value={editingSlide.config?.button_size || 'lg'}
                          onChange={(event) => patchEditingConfig({ button_size: event.target.value as ButtonSize })}
                          className={selectClass}
                        >
                          {BUTTON_SIZES.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <label className={labelClass}>Couleur fond</label>
                        <input
                          type="color"
                          value={editingSlide.config?.background_color || '#111111'}
                          onChange={(event) => patchEditingConfig({ background_color: event.target.value })}
                          className="h-10 w-full rounded-xl border border-white/10 bg-black"
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Gradient from</label>
                        <input
                          type="color"
                          value={editingSlide.config?.gradient_from || '#000000'}
                          onChange={(event) => patchEditingConfig({ gradient_from: event.target.value })}
                          className="h-10 w-full rounded-xl border border-white/10 bg-black"
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Gradient to</label>
                        <input
                          type="color"
                          value={editingSlide.config?.gradient_to || '#1f1f1f'}
                          onChange={(event) => patchEditingConfig({ gradient_to: event.target.value })}
                          className="h-10 w-full rounded-xl border border-white/10 bg-black"
                        />
                      </div>

                      <div>
                        <label className={labelClass}>Animation delay (ms)</label>
                        <Input
                          type="number"
                          min={0}
                          max={3000}
                          step={50}
                          value={editingSlide.config?.animation_delay ?? 0}
                          onChange={(event) => patchEditingConfig({ animation_delay: clamp(Number(event.target.value) || 0, 0, 3000) })}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>CSS class</label>
                      <Input value={editingSlide.config?.css_class || ''} onChange={(event) => patchEditingConfig({ css_class: event.target.value })} placeholder="hero-slide-custom" />
                    </div>

                    <div>
                      <label className={labelClass}>Style custom</label>
                      <textarea
                        value={editingSlide.config?.custom_style || ''}
                        onChange={(event) => patchEditingConfig({ custom_style: event.target.value })}
                        placeholder="color: white; text-shadow: 0 2px 8px rgba(0,0,0,.45);"
                        className={cx(textareaClass, 'font-mono text-xs')}
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-4">
                    <SectionTitle icon={<Star size={16} />} title="Priorisation & notes" />

                    <div>
                      <label className={labelClass}>Priority score</label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={editingSlide.config?.priority_score ?? 0}
                        onChange={(event) => patchEditingConfig({ priority_score: Number(event.target.value) || 0 })}
                      />
                    </div>

                    <div>
                      <label className={labelClass}>Notes internes</label>
                      <textarea
                        value={editingSlide.config?.notes || ''}
                        onChange={(event) => patchEditingConfig({ notes: event.target.value })}
                        placeholder="Brief, validateur, campagne..."
                        className={textareaClass}
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-3">
                    <SectionTitle icon={<Info size={16} />} title="Métadonnées" />

                    <div className="space-y-2 text-xs text-neutral-400">
                      <p>Créé le : {editingSlide.created_at ? new Date(editingSlide.created_at).toLocaleString('fr-FR') : '—'}</p>
                      <p>Modifié le : {editingSlide.updated_at ? new Date(editingSlide.updated_at).toLocaleString('fr-FR') : '—'}</p>
                      <p>Support config : {hasSlideConfig ? 'oui' : 'non'}</p>
                      <p>Support image_alt : {supportedSlideColumns.has('image_alt') ? 'oui' : 'non'}</p>
                    </div>
                  </section>
                </div>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </ToastProvider>
  );
}

function ZapLikeIcon() {
  return <Sparkles size={14} />;
}