export interface AdkPart {
  text?: string
  thought?: boolean
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response?: Record<string, unknown> }
}

export interface AdkEvent {
  id?: string
  author?: string
  invocationId?: string
  partial?: boolean
  content?: { role?: string; parts?: AdkPart[] }
  actions?: { stateDelta?: Record<string, unknown> }
  timestamp?: number
  error?: string
}

export interface AdkSessionSummary {
  id: string
  appName: string
  userId: string
  lastUpdateTime: number
}

export interface AdkSession extends AdkSessionSummary {
  state: Record<string, unknown>
  events: AdkEvent[]
}

export interface ToolCallInfo {
  id: string
  name: string
  status: 'running' | 'done'
}

export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  /** Committed answer text from finished LLM turns. */
  textDone: string
  /** Streaming answer text of the current LLM turn (partial events). */
  textLive: string
  thoughtDone: string
  thoughtLive: string
  tools: ToolCallInfo[]
  streaming: boolean
}

export function messageText(m: UiMessage): string {
  return m.textDone + m.textLive
}

export function messageThought(m: UiMessage): string {
  return m.thoughtDone + m.thoughtLive
}
