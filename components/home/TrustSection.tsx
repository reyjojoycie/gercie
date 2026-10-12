// components/TrustSection.tsx
'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, useAnimation, useInView } from 'framer-motion';
import { Container } from '@/components/layout/Container';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import { useTrustData } from '@/hooks/useTrustData';
import * as Icons from 'lucide-react';

// Sous-composant : compteur animé
function AnimatedCounter({
  target,
  suffix = '',
  prefix = '',
  duration = 2,
  decimals = 0,
}: {
  target: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
  decimals?: number;
}) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const increment = target / (duration * 60);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 1000 / 60);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return (
    <span ref={ref}>
      {prefix}{count.toFixed(decimals)}{suffix}
    </span>
  );
}

// Récupération dynamique de l'icône Lucide
const getIcon = (iconName: string) => {
  const LucideIcon = (Icons as any)[iconName];
  return LucideIcon ? <LucideIcon size={28} /> : <Icons.HelpCircle size={28} />;
};

export default function TrustSection() {
  const { stats, testimonials, loading, error } = useTrustData();
  const controls = useAnimation();
  const sectionRef = useRef<HTMLDivElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: '-100px' });

  useEffect(() => {
    if (inView) controls.start('visible');
  }, [inView, controls]);

  const [currentTestimonial, setCurrentTestimonial] = useState(0);

  useEffect(() => {
    if (testimonials.length === 0) return;
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [testimonials.length]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
  };

  // Affichage du chargement
  if (loading) {
    return (
      <section className="py-16 md:py-24">
        <Container>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card rounded-2xl p-4">
                <Skeleton variant="rectangular" className="w-14 h-14 rounded-2xl mx-auto mb-3" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-20 h-6 mx-auto mb-2" shimmer shimmerVariant="gold" />
                <Skeleton variant="text" className="w-24 h-4 mx-auto" shimmer shimmerVariant="gold" />
              </div>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  // Affichage d'erreur
  if (error) {
    return (
      <section className="py-16 md:py-24 text-center text-red-500">
        <Container>
          <p>Erreur lors du chargement des données de confiance.</p>
        </Container>
      </section>
    );
  }

  // Pas de données
  if (stats.length === 0 && testimonials.length === 0) {
    return null;
  }

  return (
    <section ref={sectionRef} className="py-16 md:py-24 relative overflow-hidden">
      {/* Fond décoratif */}
      <div className="absolute inset-0 bg-gradient-to-br from-gold-50 via-amber-50/30 to-transparent dark:from-gold-950/20 dark:via-amber-950/10 dark:to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-gold-400/40 to-transparent" />
      <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-gold-400/20 to-transparent" />

      <Container className="relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate={controls}
          className="text-center mb-12"
        >
          <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gold-100 dark:bg-gold-900/30 border border-gold-400/30 mb-4">
            <Icons.BadgeCheck size={16} className="text-gold-600" />
            <span className="text-sm font-medium text-gold-700 dark:text-gold-300">La confiance, notre priorité</span>
          </motion.div>
          <motion.h2 variants={itemVariants} className="text-3xl md:text-4xl font-bold text-foreground font-serif">
            Ils nous font confiance
          </motion.h2>
          <motion.p variants={itemVariants} className="text-muted-foreground mt-3 max-w-2xl mx-auto text-base md:text-lg">
            Rejoignez les milliers de clients satisfaits qui ont choisi Gercie pour leurs achats en ligne en RDC.
          </motion.p>

          {/* Témoignage tournant (si existant) */}
          {testimonials.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="mt-6 max-w-xl mx-auto bg-card rounded-2xl p-5 border border-gold-400/20 shadow-sm"
            >
              <motion.p
                key={testimonials[currentTestimonial]?.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="text-lg italic text-muted-foreground"
              >
                « {testimonials[currentTestimonial]?.quote} »
              </motion.p>
              <p className="text-sm font-semibold mt-2 text-foreground">
                {testimonials[currentTestimonial]?.author}
              </p>
              <p className="text-xs text-muted-foreground">
                {testimonials[currentTestimonial]?.role}
              </p>
            </motion.div>
          )}
        </motion.div>

        {/* Grille des statistiques */}
        {stats.length > 0 && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate={controls}
            className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4"
          >
            {stats.map((stat) => (
              <motion.div
                key={stat.id}
                variants={itemVariants}
                whileHover={{ y: -4, boxShadow: '0 12px 24px rgba(0,0,0,0.08)' }}
                className="bg-card rounded-2xl p-4 text-center border border-border hover:border-gold-400/40 transition-all duration-300 group"
              >
                <motion.div
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.6 }}
                  className={cn(
                    'inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-secondary mb-3 group-hover:bg-gold-100 dark:group-hover:bg-gold-900/30 transition-colors',
                    stat.color
                  )}
                >
                  {getIcon(stat.icon_name)}
                </motion.div>
                <p className="text-2xl md:text-3xl font-extrabold text-foreground font-mono">
                  <AnimatedCounter
                    target={stat.value}
                    suffix={stat.suffix}
                    prefix={stat.prefix}
                    decimals={stat.decimals}
                  />
                </p>
                <p className="text-sm font-semibold text-foreground mt-1">{stat.label}</p>
                {stat.description && (
                  <p className="text-xs text-muted-foreground mt-1 hidden sm:block">{stat.description}</p>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Liens supplémentaires */}
        <motion.div
          variants={itemVariants}
          initial="hidden"
          animate={controls}
          className="mt-10 text-center flex flex-wrap gap-4 justify-center"
        >
          <Link href="/avis">
            <Button variant="outline-gold" size="sm" leftIcon={<Icons.MessageCircle size={14} />}>
              Lire tous les avis
            </Button>
          </Link>
          <Link href="/livraison">
            <Button variant="outline-gold" size="sm" leftIcon={<Icons.Truck size={14} />}>
              Infos livraison
            </Button>
          </Link>
          <Link href="/a-propos">
            <Button variant="outline-gold" size="sm" leftIcon={<Icons.Award size={14} />}>
              À propos de Gercie
            </Button>
          </Link>
        </motion.div>
      </Container>
    </section>
  );
}