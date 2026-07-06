import { useCallback, useState } from 'react'
import { toast } from 'sonner'

import { createSession, deleteSession, listSessions } from '@/lib/adk-client'
import { removeTitle } from '@/lib/titles'
import type { AdkSession, AdkSessionSummary } from '@/lib/types'

export function useSessions(): {
  sessions: AdkSessionSummary[]
  refresh: () => Promise<void>
  create: () => Promise<AdkSession>
  remove: (sessionId: string) => Promise<void>
} {
  const [sessions, setSessions] = useState<AdkSessionSummary[]>([])

  const refresh = useCallback(async () => {
    try {
      const list = await listSessions()
      list.sort((a, b) => (b.lastUpdateTime ?? 0) - (a.lastUpdateTime ?? 0))
      setSessions(list)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }, [])

  const create = useCallback(async (): Promise<AdkSession> => {
    const session = await createSession()
    await refresh()
    return session
  }, [refresh])

  const remove = useCallback(
    async (sessionId: string) => {
      try {
        await deleteSession(sessionId)
        removeTitle(sessionId)
        await refresh()
      } catch (e) {
        toast.error((e as Error).message)
      }
    },
    [refresh]
  )

  return { sessions, refresh, create, remove }
}
