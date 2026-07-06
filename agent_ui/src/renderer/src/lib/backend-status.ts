// Lets the API client signal "backend unreachable" to the app shell without
// threading callbacks through every hook.
type Listener = () => void

const listeners = new Set<Listener>()

export function onBackendDown(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyBackendDown(): void {
  listeners.forEach((listener) => listener())
}
