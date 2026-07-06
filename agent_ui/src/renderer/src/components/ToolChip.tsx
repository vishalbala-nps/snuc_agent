import { CheckIcon, Loader2Icon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { ToolCallInfo } from '@/lib/types'

export function ToolChip({ tool }: { tool: ToolCallInfo }): React.JSX.Element {
  const label = tool.name.replace(/_/g, ' ')
  return (
    <Badge variant="secondary" className="gap-1 font-normal text-muted-foreground">
      {tool.status === 'running' ? (
        <Loader2Icon className="size-3 animate-spin" />
      ) : (
        <CheckIcon className="size-3" />
      )}
      {label}
    </Badge>
  )
}
