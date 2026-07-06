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
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedToBottom = useRef(true)

  // The Radix ScrollArea viewport is the actual scrolling element.
  const getViewport = (): HTMLElement | null =>
    scrollRef.current?.querySelector('[data-slot="scroll-area-viewport"]') ?? null

  // Follow the stream only while the user is at the bottom; scrolling up to
  // read pauses the auto-scroll until they return to the bottom.
  const handleScroll = (): void => {
    const viewport = getViewport()
    if (!viewport) return
    pinnedToBottom.current =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40
  }

  useEffect(() => {
    const viewport = getViewport()
    if (viewport && pinnedToBottom.current) {
      viewport.scrollTop = viewport.scrollHeight
    }
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
    <ScrollArea ref={scrollRef} className="min-h-0 flex-1" onScrollCapture={handleScroll}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
    </ScrollArea>
  )
}
