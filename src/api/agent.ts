import type { SessionState } from '../types'

const API_BASE = (import.meta.env.VITE_AGENT_API as string | undefined)?.replace(/\/$/, '') || ''

export type TurnRequest = {
  sessionId?: string
  message: string
  /** optional client hints — server may ignore */
  action?: 'turn' | 'reset'
}

export type TurnResponse = {
  utterance: string
  state: SessionState
  sessionId: string
}

export async function postTurn(req: TurnRequest): Promise<TurnResponse> {
  const res = await fetch(`${API_BASE}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'turn', ...req }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Agent API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<TurnResponse>
}

export async function postReset(sessionId?: string): Promise<TurnResponse> {
  const res = await fetch(`${API_BASE}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset', sessionId, message: '' }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Agent API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<TurnResponse>
}
