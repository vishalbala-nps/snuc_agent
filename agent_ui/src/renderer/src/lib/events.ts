import type { AdkEvent, UiMessage } from './types'
import { messageText, messageThought } from './types'

let counter = 0
export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${counter++}`
}

export function newUserMessage(text: string): UiMessage {
  return {
    id: newId('user'),
    role: 'user',
    textDone: text,
    textLive: '',
    thoughtDone: '',
    thoughtLive: '',
    tools: [],
    streaming: false
  }
}

export function newAssistantMessage(): UiMessage {
  return {
    id: newId('assistant'),
    role: 'assistant',
    textDone: '',
    textLive: '',
    thoughtDone: '',
    thoughtLive: '',
    tools: [],
    streaming: true
  }
}

function joinBlock(done: string, add: string): string {
  if (!add) return done
  if (!done) return add
  return done + '\n\n' + add
}

/**
 * Folds one streamed ADK event into an assistant message (immutably).
 *
 * Streaming shape: `partial: true` events carry incremental token chunks of
 * the current LLM turn; the turn then ends with a final event that REPEATS
 * the whole turn's text (so it replaces the live buffers instead of
 * appending) — or with a functionCall event when the model decided to call
 * a tool. A run may contain several such turns separated by tool calls;
 * finished turns are committed into textDone/thoughtDone.
 */
export function foldEvent(msg: UiMessage, event: AdkEvent): UiMessage {
  const parts = event.content?.parts ?? []
  const next: UiMessage = { ...msg, tools: [...msg.tools] }

  for (const part of parts) {
    if (part.functionCall) {
      next.tools.push({
        id: part.functionCall.id ?? `${part.functionCall.name}-${next.tools.length}`,
        name: part.functionCall.name,
        status: 'running'
      })
    }
    if (part.functionResponse) {
      const key = part.functionResponse.id
      next.tools = next.tools.map((tool) =>
        (key && tool.id === key) || (!key && tool.name === part.functionResponse!.name)
          ? { ...tool, status: 'done' as const }
          : tool
      )
    }
  }

  const thoughtText = parts
    .filter((p) => p.text && p.thought)
    .map((p) => p.text)
    .join('')
  const plainText = parts
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('')

  if (event.partial) {
    next.thoughtLive = msg.thoughtLive + thoughtText
    next.textLive = msg.textLive + plainText
  } else {
    // Final event of a turn: prefer its aggregated text over the live
    // buffers (never both — that would duplicate), then commit the turn.
    next.thoughtDone = joinBlock(next.thoughtDone, thoughtText || next.thoughtLive)
    next.textDone = joinBlock(next.textDone, plainText || next.textLive)
    next.thoughtLive = ''
    next.textLive = ''
  }
  return next
}

/** Commits any leftover live buffers when a stream ends or is aborted. */
export function finalizeMessage(msg: UiMessage): UiMessage {
  return {
    ...msg,
    textDone: joinBlock(msg.textDone, msg.textLive),
    thoughtDone: joinBlock(msg.thoughtDone, msg.thoughtLive),
    textLive: '',
    thoughtLive: '',
    streaming: false,
    tools: msg.tools.map((t) => ({ ...t, status: 'done' as const }))
  }
}

/**
 * Rebuilds the message list from a stored session's events (history restore).
 * Session history only contains final (non-partial) events. Consecutive agent
 * events of one invocation merge into a single assistant message.
 */
export function eventsToMessages(events: AdkEvent[]): UiMessage[] {
  const messages: UiMessage[] = []
  let currentIndex = -1
  let currentInvocation: string | undefined

  for (const event of events) {
    const parts = event.content?.parts ?? []
    if (!parts.length) continue

    const hasToolParts = parts.some((p) => p.functionCall || p.functionResponse)
    const isUserMessage =
      event.author === 'user' && !hasToolParts && parts.some((p) => p.text && !p.thought)

    if (isUserMessage) {
      const text = parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join('')
      messages.push({ ...newUserMessage(text), id: event.id ?? newId('user') })
      currentIndex = -1
      currentInvocation = undefined
      continue
    }

    if (currentIndex === -1 || event.invocationId !== currentInvocation) {
      messages.push({ ...newAssistantMessage(), streaming: false })
      currentIndex = messages.length - 1
      currentInvocation = event.invocationId
    }
    messages[currentIndex] = foldEvent(messages[currentIndex], { ...event, partial: false })
  }

  return messages.filter(
    (m) => m.role === 'user' || messageText(m) || messageThought(m) || m.tools.length > 0
  )
}
