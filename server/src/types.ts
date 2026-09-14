export type SessionPhase = 'clarifying' | 'recipe_active' | 'celebrating' | 'ended'
export type ClarifyingStep = 'wishing' | 'exploring' | 'confirming' | 'done'

export type EventType =
  | 'session_started'
  | 'wish_confirmed'
  | 'recipe_issued'
  | 'recipe_completed'
  | 'celebration_triggered'
  | 'recipe_adjusted'
  | 'recipe_superseded'
  | 'session_ended'
  | 'message_sent'
  | 'tool_rejected'

export interface AppEvent {
  id: string
  type: EventType
  at: string
  payload?: Record<string, unknown>
}

export interface Wish {
  text: string
  doneLooksLike: string
  confirmedAt: string
}

export interface Recipe {
  id: string
  anchor: string
  action: string
  durationMin: number
  difficulty: 1
  status: 'active' | 'completed' | 'superseded'
  issuedAt: string
  completedAt?: string
  supersededAt?: string
}

export interface ChatMessage {
  id: string
  role: 'coach' | 'user' | 'system'
  text: string
  at: string
}

export interface SessionState {
  id: string
  phase: SessionPhase
  wish: Wish | null
  recipes: Recipe[]
  activeRecipeId: string | null
  messages: ChatMessage[]
  events: AppEvent[]
  clarifyingStep: ClarifyingStep
  draftWish: string
  draftDoneLooksLike: string
  exploreUserTurns: number
  draftBehavior: string
  draftAnchor: string
  /** Explicit user want-to-do; required before issue_recipe */
  wantToDo: boolean
}

export const CELEBRATION_COPY = '今天，你把这件小事做成了。'

export type ToolName =
  | 'utter'
  | 'set_draft'
  | 'confirm_wish'
  | 'issue_recipe'
  | 'complete_recipe'
  | 'adjust_recipe'
  | 'end_session'

export interface ToolCall {
  name: ToolName
  args?: Record<string, unknown>
}

export interface ToolResult {
  ok: boolean
  reason?: string
  userMessage?: string
}

export interface ReasonOutput {
  utterance?: string
  tool_calls: ToolCall[]
}

export interface TurnResponse {
  sessionId: string
  utterance: string
  state: SessionState
  rejected?: Array<{ tool: string; reason: string }>
}
