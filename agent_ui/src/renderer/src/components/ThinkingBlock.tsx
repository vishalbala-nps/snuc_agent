import { BrainIcon, ChevronDownIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

export function ThinkingBlock({
  thought,
  hasAnswer,
  streaming
}: {
  thought: string
  hasAnswer: boolean
  streaming: boolean
}): React.JSX.Element {
  // Open while thoughts stream, auto-collapse once the answer starts —
  // but only once, so the user can re-expand it afterwards.
  const [open, setOpen] = useState(streaming && !hasAnswer)
  const autoCollapsed = useRef(false)
  useEffect(() => {
    if (hasAnswer && !autoCollapsed.current) {
      autoCollapsed.current = true
      setOpen(false)
    }
  }, [hasAnswer])

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
        <BrainIcon className="size-3.5" />
        {streaming && !hasAnswer ? 'Thinking…' : 'Thoughts'}
        <ChevronDownIcon className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground">
          {thought}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
