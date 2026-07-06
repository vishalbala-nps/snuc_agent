import { notifyBackendDown } from './backend-status'
import { API_BASE, APP_NAME, USER_ID } from './config'
import { readSse } from './sse'
import type { AdkEvent, AdkSession, AdkSessionSummary } from './types'

const SESSIONS_BASE = `${API_BASE}/apps/${APP_NAME}/users/${USER_ID}/sessions`

export class BackendDownError extends Error {
  constructor() {
    super('The ADK API server is not reachable.')
    this.name = 'BackendDownError'
  }
}

/**
 * fetch() that converts network-level failures ("Failed to fetch") into a
 * BackendDownError and notifies the app shell, which shows the retry dialog.
 * Abort errors pass through untouched.
 */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    notifyBackendDown()
    throw new BackendDownError()
  }
  if (!res.ok) {
    throw new Error(`Backend error: HTTP ${res.status} ${res.statusText}`)
  }
  return res
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`)
    return res.ok
  } catch {
    return false
  }
}

export async function createSession(): Promise<AdkSession> {
  const res = await apiFetch(SESSIONS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  return res.json()
}

export async function listSessions(): Promise<AdkSessionSummary[]> {
  const res = await apiFetch(SESSIONS_BASE)
  return res.json()
}

export async function getSession(sessionId: string): Promise<AdkSession> {
  const res = await apiFetch(`${SESSIONS_BASE}/${sessionId}`)
  return res.json()
}

export async function deleteSession(sessionId: string): Promise<void> {
  await apiFetch(`${SESSIONS_BASE}/${sessionId}`, { method: 'DELETE' })
}

/**
 * Streams one agent run. onEvent fires for every SSE event in order.
 * Throws BackendDownError if the server is unreachable (also mid-stream),
 * or Error if the server reports an error chunk.
 */
export async function runSse(
  sessionId: string,
  text: string,
  onEvent: (event: AdkEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await apiFetch(`${API_BASE}/run_sse`, {
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
  try {
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
  } catch (e) {
    // A network drop mid-stream surfaces as a TypeError from the reader.
    if (e instanceof TypeError) {
      notifyBackendDown()
      throw new BackendDownError()
    }
    throw e
  }
}
