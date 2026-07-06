/**
 * Parses a fetch() Response with content-type text/event-stream into the
 * string payloads of its `data:` lines. EventSource cannot POST, so the
 * ADK /run_sse endpoint has to be consumed manually like this.
 *
 * The buffer persists across network chunks, so a JSON payload split across
 * reads is reassembled before being yielded.
 */
export async function* readSse(res: Response): AsyncGenerator<string> {
  if (!res.body) return
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        const data = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data) yield data
      }
    }
  } finally {
    reader.releaseLock()
  }
}
