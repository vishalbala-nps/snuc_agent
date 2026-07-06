// The ADK session-list endpoint omits events, so the first user message of
// each session is cached here to serve as its sidebar title.
const STORAGE_KEY = 'session-titles'

function readMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

export function getTitle(sessionId: string): string | undefined {
  return readMap()[sessionId]
}

export function setTitle(sessionId: string, firstMessage: string): void {
  const map = readMap()
  if (map[sessionId]) return
  map[sessionId] = firstMessage.length > 40 ? firstMessage.slice(0, 40) + '…' : firstMessage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function removeTitle(sessionId: string): void {
  const map = readMap()
  delete map[sessionId]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}
