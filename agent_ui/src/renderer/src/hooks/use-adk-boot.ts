import { useEffect, useState } from 'react'

import { checkHealth } from '@/lib/adk-client'

export type AdkBootStatus = 'starting' | 'ready' | 'failed'

// Mirrors the old main-process boot budget (retryAttempt=50, 500ms apart ≈ 25s).
const MAX_ATTEMPTS = 50
const RETRY_DELAY_MS = 500

export function useAdkBoot(): AdkBootStatus {
  const [status, setStatus] = useState<AdkBootStatus>('starting')

  useEffect(() => {
    let cancelled = false

    async function waitForAdk(): Promise<void> {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) return
        if (await checkHealth()) {
          if (!cancelled) setStatus('ready')
          return
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
        }
      }
      if (!cancelled) setStatus('failed')
    }

    waitForAdk()
    return () => {
      cancelled = true
    }
  }, [])

  return status
}
