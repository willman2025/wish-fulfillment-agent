import {
  CELEBRATION_COPY,
  type SessionState,
} from '../state/session.js'
import {
  assertConfirmWish,
  assertIssueRecipe,
  containsBlackHat,
  isFillerAction,
} from '../tools/guards.js'
import type { ToolCall } from './llm.js'

export type ToolResult = { ok: boolean; reject?: string; state: SessionState; utteranceExtra?: string }

function pushEvent(s: SessionState, type: string, payload?: Record<string, unknown>) {
  s.events.push({ type, at: new Date().toISOString(), payload })
}

export function executeTools(
  state: SessionState,
  calls: ToolCall[],
): { state: SessionState; notes: string[] } {
  const notes: string[] = []
  let s = state

  for (const call of calls) {
    const r = runOne(s, call)
    s = r.state
    if (!r.ok) {
      notes.push(r.reject || 'tool rejected')
      pushEvent(s, 'tool_rejected', { tool: call.name, reason: r.reject })
    } else {
      pushEvent(s, 'tool_accepted', { tool: call.name })
      if (r.utteranceExtra) notes.push(r.utteranceExtra)
    }
  }
  return { state: s, notes }
}

function runOne(s: SessionState, call: ToolCall): ToolResult {
  const args = call.arguments || {}
  switch (call.name) {
    case 'utter': {
      const text = String(args.text || '')
      if (containsBlackHat(text)) {
        return { ok: false, reject: '含黑话', state: s }
      }
      s = {
        ...s,
        messages: [...s.messages, { role: 'coach', text }],
      }
      return { ok: true, state: s }
    }
    case 'set_draft': {
      if (s.phase !== 'clarifying') return { ok: false, reject: '仅澄清期', state: s }
      const bump = Boolean(args.bumpExplore)
      s = {
        ...s,
        clarifyingStep: s.clarifyingStep === 'wishing' ? 'exploring' : s.clarifyingStep,
        exploreUserTurns: bump ? s.exploreUserTurns + 1 : s.exploreUserTurns,
        draftWish: args.wish ? String(args.wish) : s.draftWish,
        draftDoneLooksLike: args.doneLooksLike
          ? String(args.doneLooksLike)
          : s.draftDoneLooksLike,
        draftBehavior: args.behavior ? String(args.behavior) : s.draftBehavior,
        draftAnchor: args.anchor ? String(args.anchor) : s.draftAnchor,
      }
      return { ok: true, state: s }
    }
    case 'confirm_wish': {
      const want = Boolean(args.wantToDo)
      const err = assertConfirmWish(s, want)
      if (err) return { ok: false, reject: err, state: s }
      const text = String(args.text || s.draftWish)
      const done = String(args.doneLooksLike || s.draftDoneLooksLike || '你已经朝这个方向认真动了一下')
      s = {
        ...s,
        wish: { text, doneLooksLike: done },
        draftWish: text,
        clarifyingStep: 'done',
        events: s.events,
      }
      pushEvent(s, 'wish_confirmed', { text })
      return { ok: true, state: s }
    }
    case 'issue_recipe': {
      const action = String(args.action || '')
      const anchor = String(args.anchor || '打开电脑后')
      const durationMin = Math.min(2, Number(args.durationMin || 2))
      const err = assertIssueRecipe(s, action, durationMin)
      if (err) return { ok: false, reject: err, state: s }
      if (isFillerAction(action)) return { ok: false, reject: 'filler', state: s }
      const id = `r_${Date.now()}`
      s = {
        ...s,
        phase: 'recipe_active',
        activeRecipe: { id, anchor, action, durationMin },
      }
      pushEvent(s, 'recipe_issued', { id, action, anchor })
      const card = `【今日小配方】\n锚点：${anchor}\n动作：${action}\n时长：约 ${durationMin} 分钟`
      s = { ...s, messages: [...s.messages, { role: 'coach', text: card }] }
      return { ok: true, state: s }
    }
    case 'complete_recipe': {
      if (s.phase !== 'recipe_active' || !s.activeRecipe) {
        return { ok: false, reject: '无进行中配方', state: s }
      }
      s = {
        ...s,
        phase: 'celebrating',
        activeRecipe: null,
        messages: [
          ...s.messages,
          { role: 'system', text: CELEBRATION_COPY },
          { role: 'coach', text: `${CELEBRATION_COPY}\n\n这一下已经够了。` },
        ],
      }
      pushEvent(s, 'recipe_completed', {})
      pushEvent(s, 'celebration_triggered', { copy: CELEBRATION_COPY })
      return { ok: true, state: s }
    }
    case 'adjust_recipe': {
      if (s.phase !== 'recipe_active' || !s.activeRecipe) {
        return { ok: false, reject: '无进行中配方', state: s }
      }
      const action = String(args.action || '')
      const anchor = String(args.anchor || s.activeRecipe.anchor)
      const durationMin = Math.min(2, Number(args.durationMin || 1))
      if (isFillerAction(action)) return { ok: false, reject: 'filler', state: s }
      const id = `r_${Date.now()}`
      s = {
        ...s,
        activeRecipe: { id, anchor, action, durationMin },
        messages: [
          ...s.messages,
          {
            role: 'coach',
            text: `好，换成更小的一步：\n锚点：${anchor}\n动作：${action}`,
          },
        ],
      }
      pushEvent(s, 'recipe_adjusted', { action })
      return { ok: true, state: s }
    }
    case 'end_session': {
      s = { ...s, phase: 'ended', activeRecipe: null }
      pushEvent(s, 'session_ended', {})
      return { ok: true, state: s }
    }
    default:
      return { ok: false, reject: `未知工具 ${call.name}`, state: s }
  }
}
