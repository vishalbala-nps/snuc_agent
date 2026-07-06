import { SendIcon, SquareIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

export function Composer({
  streaming,
  onSend,
  onStop
}: {
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}): React.JSX.Element {
  const [text, setText] = useState('')

  const submit = (): void => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return
    setText('')
    onSend(trimmed)
  }

  return (
    <div className="border-t bg-background p-4">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Message SNUC Agent…"
          className="max-h-40 min-h-10 resize-none"
          rows={1}
        />
        {streaming ? (
          <Button size="icon" variant="destructive" onClick={onStop} aria-label="Stop">
            <SquareIcon />
          </Button>
        ) : (
          <Button size="icon" onClick={submit} disabled={!text.trim()} aria-label="Send">
            <SendIcon />
          </Button>
        )}
      </div>
    </div>
  )
}
