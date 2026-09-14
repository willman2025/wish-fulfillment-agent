export type SessionPhase = 'clarifying' | 'recipe_active' | 'celebrating' | 'ended'

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
  supersedesId?: string
}

export interface ChatMessage {
  id: string
  role: 'coach' | 'user' | 'system'
  text: string
  at: string
}

export interface SessionState {
  phase: SessionPhase
  wish: Wish | null
  recipes: Recipe[]
  activeRecipeId: string | null
  messages: ChatMessage[]
  events: AppEvent[]
  clarifyingStep: ClarifyingStep
  draftWish: string
  draftDoneLooksLike: string
}

export type ClarifyingStep =
  | 'opening'
  | 'awaiting_direction'
  | 'refining'
  | 'confirming'
  | 'done'

export const CELEBRATION_COPY = '今天，你把这件小事做成了。'

export const STORAGE_KEY = 'wish-fulfillment-agent:v1'
