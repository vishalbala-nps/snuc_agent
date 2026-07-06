import { API_BASE, APP_NAME, USER_ID } from './config'
import { readSse } from './sse'
import type { AdkEvent, AdkSession, AdkSessionSummary } from './types'

const SESSIONS_BASE = `${API_BASE}/apps/${APP_NAME}/users/${USER_ID}/sessions`

async function expectOk(res: Response): Promise<Response> {
  if (!res.ok) {
    throw new Error(`Backend error: HTTP ${res.status} ${res.statusText}`)
  }
  return res
}

export async function createSession(): Promise<AdkSession> {
  const res = await fetch(SESSIONS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  return (await expectOk(res)).json()
}

export async function listSessions(): Promise<AdkSessionSummary[]> {
  const res = await fetch(SESSIONS_BASE)
  return (await expectOk(res)).json()
}

export async function getSession(sessionId: string): Promise<AdkSession> {
  const res = await fetch(`${SESSIONS_BASE}/${sessionId}`)
  return (await expectOk(res)).json()
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${SESSIONS_BASE}/${sessionId}`, { method: 'DELETE' })
  await expectOk(res)
}

/**
 * Streams one agent run. onEvent fires for every SSE event in order.
 * Throws if the server reports an error chunk or the response is not ok.
 */
export async function runSse(
  sessionId: string,
  text: string,
  onEvent: (event: AdkEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${API_BASE}/run_sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appName: APP_NAME,
      userId: USER_ID,
      sessionId,
      newMessage: { role: 'user', parts: [{ text }] },
      streaming: true
    }),
    signal
  })
  await expectOk(res)
  for await (const data of readSse(res)) {
    let event: AdkEvent
    try {
      event = JSON.parse(data)
    } catch {
      continue
    }
    if (event.error) throw new Error(event.error)
    onEvent(event)
  }
}
