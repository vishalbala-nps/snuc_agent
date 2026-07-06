import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { ThinkingBlock } from '@/components/ThinkingBlock'
import { ToolChip } from '@/components/ToolChip'
import { Skeleton } from '@/components/ui/skeleton'
import type { UiMessage } from '@/lib/types'
import { messageText, messageThought } from '@/lib/types'

export function MessageBubble({ message }: { message: UiMessage }): React.JSX.Element {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {message.textDone}
        </div>
      </div>
    )
  }

  const text = messageText(message)
  const thought = messageThought(message)
  const waiting = message.streaming && !text && !thought

  return (
    <div className="flex flex-col gap-2">
      {message.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.tools.map((tool, i) => (
            <ToolChip key={`${tool.id}-${i}`} tool={tool} />
          ))}
        </div>
      )}
      {thought && (
        <ThinkingBlock thought={thought} hasAnswer={!!text} streaming={message.streaming} />
      )}
      {text && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      )}
      {waiting && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      )}
    </div>
  )
}
