import type { SessionState } from './types'

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const sessions = new Map<string, SessionState>()

export function createSession(): SessionState {
  const id = uid('sess')
  const opening =
    '嗨，我是你的愿望教练。\n\n先随便许一个愿，可以很模糊；我们慢慢聊清楚，再给你一个小但认真的第一步。\n\n你心里现在有什么想靠近的事吗？不用完整，一句话就好。'
  const state: SessionState = {
    id,
    phase: 'clarifying',
    wish: null,
    recipes: [],
    activeRecipeId: null,
    messages: [
      {
        id: uid('msg'),
        role: 'coach',
        text: opening,
        at: new Date().toISOString(),
      },
    ],
    events: [
      {
        id: uid('evt'),
        type: 'session_started',
        at: new Date().toISOString(),
      },
    ],
    clarifyingStep: 'wishing',
    draftWish: '',
    draftDoneLooksLike: '',
    exploreUserTurns: 0,
    draftBehavior: '',
    draftAnchor: '',
    wantToDo: false,
  }
  sessions.set(id, state)
  return state
}

export function getSession(id: string): SessionState | undefined {
  return sessions.get(id)
}

export function saveSession(state: SessionState): void {
  sessions.set(state.id, state)
}

export function resetStore(): void {
  sessions.clear()
}

export { uid }
