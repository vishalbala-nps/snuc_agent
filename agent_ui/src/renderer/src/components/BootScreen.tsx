import type { ReactNode } from 'react'

import { Spinner } from '@/components/ui/spinner'

interface BootScreenProps {
  title: string
  subtitle?: string
  spinner?: boolean
  action?: ReactNode
}

export function BootScreen({
  title,
  subtitle,
  spinner = true,
  action
}: BootScreenProps): React.JSX.Element {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background text-foreground">
      <h3 className="text-lg font-medium">{title}</h3>
      {subtitle && <p className="max-w-sm text-center text-sm text-muted-foreground">{subtitle}</p>}
      {spinner && <Spinner />}
      {action}
    </div>
  )
}
