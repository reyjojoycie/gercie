// hooks/useTrustData.ts
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';

export interface TrustStat {
  id: string;
  icon_name: string;
  value: number;
  suffix: string;
  prefix: string;
  label: string;
  description: string;
  color: string;
  decimals: number;
  sort_order: number;
  is_active: boolean;
}

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  role: string;
  sort_order: number;
  is_active: boolean;
}

export function useTrustData() {
  const [stats, setStats] = useState<TrustStat[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, testimonialsRes] = await Promise.all([
          supabaseBrowser
            .from('trust_stats')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
          supabaseBrowser
            .from('trust_testimonials')
            .select('*')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        ]);

        if (statsRes.error) throw statsRes.error;
        if (testimonialsRes.error) throw testimonialsRes.error;

        setStats(statsRes.data || []);
        setTestimonials(testimonialsRes.data || []);
      } catch (err) {
        console.error('useTrustData error:', err);
        setError(err instanceof Error ? err : new Error('Erreur inconnue'));
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return { stats, testimonials, loading, error };
}