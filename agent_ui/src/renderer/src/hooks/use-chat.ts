import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

import { getSession, runSse } from '@/lib/adk-client'
import {
  eventsToMessages,
  finalizeMessage,
  foldEvent,
  newAssistantMessage,
  newUserMessage
} from '@/lib/events'
import { setTitle } from '@/lib/titles'
import type { UiMessage } from '@/lib/types'

export function useChat(): {
  messages: UiMessage[]
  streaming: boolean
  loading: boolean
  send: (sessionId: string, text: string) => Promise<void>
  stop: () => void
  loadSession: (sessionId: string) => Promise<void>
  clear: () => void
} {
  const [messages, setMessages] = useState<UiMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const loadSession = useCallback(async (sessionId: string) => {
    setLoading(true)
    try {
      const session = await getSession(sessionId)
      setMessages(eventsToMessages(session.events ?? []))
    } catch (e) {
      toast.error((e as Error).message)
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [])

  const clear = useCallback(() => setMessages([]), [])

  const send = useCallback(async (sessionId: string, text: string) => {
    setTitle(sessionId, text)
    setMessages((prev) => [...prev, newUserMessage(text), newAssistantMessage()])
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      await runSse(
        sessionId,
        text,
        (event) => {
          const url = event.actions?.stateDelta?.DOWNLOAD_URL
          if (typeof url === 'string' && url !== '') {
            // Empty string is the agent's per-tool-call reset — ignore it.
            window.api.downloadUrl(url)
          }
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (!last || last.role !== 'assistant') return prev
            return [...prev.slice(0, -1), foldEvent(last, event)]
          })
        },
        controller.signal
      )
    } catch (e) {
      const err = e as Error
      if (err.name !== 'AbortError') toast.error(err.message)
    } finally {
      abortRef.current = null
      setStreaming(false)
      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (!last || last.role !== 'assistant') return prev
        return [...prev.slice(0, -1), finalizeMessage(last)]
      })
    }
  }, [])

  const stop = useCallback(() => abortRef.current?.abort(), [])

  return { messages, streaming, loading, send, stop, loadSession, clear }
}
