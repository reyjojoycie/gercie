// app/admin/trust/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import { useToast } from '@/components/ui/Toast';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs } from '@/components/ui/Tabs';
import { TrustStatsManager } from '@/components/admin/TrustStatsManager';
import { TrustTestimonialsManager } from '@/components/admin/TrustTestimonialsManager';
import { RefreshCw, BarChart3, MessageSquare } from 'lucide-react';

export default function AdminTrustPage() {
  const [stats, setStats] = useState<any[]>([]);
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, testimonialsRes] = await Promise.all([
        supabaseBrowser.from('trust_stats').select('*').order('sort_order', { ascending: true }),
        supabaseBrowser.from('trust_testimonials').select('*').order('sort_order', { ascending: true }),
      ]);
      if (statsRes.error) throw statsRes.error;
      if (testimonialsRes.error) throw testimonialsRes.error;
      setStats(statsRes.data || []);
      setTestimonials(testimonialsRes.data || []);
    } catch (err) {
      addToast({ type: 'error', message: 'Erreur lors du chargement' });
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Section Confiance</h1>
          <p className="text-muted-foreground">Gérez les statistiques et les témoignages</p>
        </div>
        <Button variant="outline-gold" onClick={fetchData} leftIcon={<RefreshCw size={16} />}>
          Rafraîchir
        </Button>
      </div>

      <Tabs
        tabs={[
          {
            key: 'stats',
            label: 'Statistiques',
            icon: <BarChart3 size={16} />,
            content: (
              <TrustStatsManager
                stats={stats}
                onStatsChange={setStats}
                onRefresh={fetchData}
              />
            ),
          },
          {
            key: 'testimonials',
            label: 'Témoignages',
            icon: <MessageSquare size={16} />,
            content: (
              <TrustTestimonialsManager
                testimonials={testimonials}
                onTestimonialsChange={setTestimonials}
                onRefresh={fetchData}
              />
            ),
          },
        ]}
        variant="pills"
        size="md"
        defaultIndex={0}
        animated={true}
        destroyOnHide={false}
      />
    </div>
  );
}