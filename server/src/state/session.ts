export type Phase = 'clarifying' | 'recipe_active' | 'celebrating' | 'ended'
export type ClarifyingStep = 'wishing' | 'exploring' | 'confirming' | 'done'

export const CELEBRATION_COPY = '今天，你把这件小事做成了。'

export interface SessionState {
  phase: Phase
  clarifyingStep: ClarifyingStep
  exploreUserTurns: number
  draftWish: string
  draftDoneLooksLike: string
  draftBehavior: string
  draftAnchor: string
  wish: { text: string; doneLooksLike: string } | null
  activeRecipe: {
    id: string
    anchor: string
    action: string
    durationMin: number
  } | null
  messages: Array<{ role: 'user' | 'coach' | 'system'; text: string }>
  events: Array<{ type: string; at: string; payload?: Record<string, unknown> }>
}

export function createSession(): SessionState {
  return {
    phase: 'clarifying',
    clarifyingStep: 'wishing',
    exploreUserTurns: 0,
    draftWish: '',
    draftDoneLooksLike: '',
    draftBehavior: '',
    draftAnchor: '',
    wish: null,
    activeRecipe: null,
    messages: [
      {
        role: 'coach',
        text: '嗨，我是你的愿望教练。\n\n先随便许一个愿，可以很模糊；我们慢慢聊清楚，再给你一个小但认真的第一步。',
      },
    ],
    events: [{ type: 'session_started', at: new Date().toISOString() }],
  }
}

const sessions = new Map<string, SessionState>()

export function getSession(id: string): SessionState {
  let s = sessions.get(id)
  if (!s) {
    s = createSession()
    sessions.set(id, s)
  }
  return s
}

export function saveSession(id: string, s: SessionState) {
  sessions.set(id, s)
}
