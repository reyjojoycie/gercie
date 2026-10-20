// components/auth/AuthShell.tsx
'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertCircle, ArrowLeft, CheckCircle2, Info } from 'lucide-react'
import { Container } from '@/components/layout/Container'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'

interface AuthShellProps {
  backHref: string
  backLabel: string
  icon: ReactNode
  title: string
  description?: ReactNode
  children: ReactNode
}

export function AuthShell({ backHref, backLabel, icon, title, description, children }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-midnight-950 flex items-center justify-center px-4 py-12">
      <Container size="small" className="max-w-md w-full">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-neutral-400 hover:text-gold-500 dark:hover:text-gold-400 mb-8 text-sm transition-colors"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {backLabel}
        </Link>

        <Card variant="glass" className="border-gold-400/20 shadow-gold">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-100 dark:bg-gold-900/30">
              {icon}
            </div>
            <CardTitle className="text-2xl font-serif text-neutral-900 dark:text-neutral-100">
              {title}
            </CardTitle>
            {description && (
              <CardDescription className="text-neutral-500 dark:text-neutral-400">
                {description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-5">{children}</CardContent>
        </Card>
      </Container>
    </div>
  )
}

export function AuthAlert({
  type,
  children,
}: {
  type: 'error' | 'success' | 'info'
  children: ReactNode
}) {
  const styles = {
    error:
      'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
    success:
      'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    info: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  }
  const Icon = type === 'error' ? AlertCircle : type === 'success' ? CheckCircle2 : Info

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`border p-4 rounded-xl text-sm flex items-start gap-2 ${styles[type]}`}
    >
      <Icon size={18} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}