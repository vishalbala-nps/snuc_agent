import { GraduationCapIcon } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { MessageBubble } from '@/components/MessageBubble'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { UiMessage } from '@/lib/types'

export function ChatThread({
  messages,
  loading
}: {
  messages: UiMessage[]
  loading: boolean
}): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView()
  }, [messages])

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 p-6">
        <Skeleton className="ml-auto h-10 w-1/3" />
        <Skeleton className="h-24 w-2/3" />
        <Skeleton className="ml-auto h-10 w-1/4" />
        <Skeleton className="h-16 w-1/2" />
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
        <GraduationCapIcon className="size-10" />
        <p className="text-lg font-medium text-foreground">SNUC Agent</p>
        <p className="max-w-sm text-center text-sm">
          Ask about your courses, assignments, attendance, mentor, outpasses or university posts.
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="flex-1">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
