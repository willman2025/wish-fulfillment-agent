import type { SessionState } from '../state/session.js'

export function buildContextBundle(s: SessionState): string {
  return JSON.stringify(
    {
      phase: s.phase,
      clarifyingStep: s.clarifyingStep,
      exploreUserTurns: s.exploreUserTurns,
      hasWish: Boolean(s.wish),
      draftWish: s.draftWish,
      hasActiveRecipe: Boolean(s.activeRecipe),
      recentMessages: s.messages.slice(-12),
    },
    null,
    2,
  )
}
