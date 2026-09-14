import { readFileSync } from 'node:fs'
import { loadSystemPrompt } from './prompt.js'
import { buildContextBundle } from './context.js'
import { reasonMock } from '../harness/llm.js'
import { executeTools } from '../harness/toolRouter.js'
import { getSession, saveSession, type SessionState } from '../state/session.js'
import { containsBlackHat } from '../tools/guards.js'

export async function handleChat(sessionId: string, userText: string) {
  let s = getSession(sessionId)
  s = {
    ...s,
    messages: [...s.messages, { role: 'user', text: userText }],
  }

  const system = loadSystemPrompt()
  const bundle = buildContextBundle(s)

  let result = await reasonMock(
    system,
    bundle,
    userText,
    s.exploreUserTurns,
    Boolean(s.wish),
    Boolean(s.activeRecipe),
    s.phase,
  )

  // one retry opportunity after rejects
  let { state, notes } = executeTools(s, result.toolCalls)
  s = state

  let utterance = result.utterance
  if (notes.some((n) => n && !n.startsWith('【'))) {
    // rejected — second reason pass with mock apology path
    const retry = await reasonMock(
      system,
      buildContextBundle(s) + `\nrejects:${notes.join(';')}`,
      userText,
      s.exploreUserTurns,
      Boolean(s.wish),
      Boolean(s.activeRecipe),
      s.phase,
    )
    const second = executeTools(s, retry.toolCalls)
    s = second.state
    if (retry.utterance) utterance = retry.utterance
  }

  if (utterance) {
    if (containsBlackHat(utterance)) {
      utterance = '我们继续聊你的愿望本身就好——先不谈那些术语。'
    }
    s = {
      ...s,
      messages: [...s.messages, { role: 'coach', text: utterance }],
    }
  }

  saveSession(sessionId, s)
  return {
    utterance:
      utterance ||
      s.messages.filter((m) => m.role === 'coach').slice(-1)[0]?.text ||
      '',
    state: {
      phase: s.phase,
      clarifyingStep: s.clarifyingStep,
      exploreUserTurns: s.exploreUserTurns,
      wish: s.wish,
      activeRecipe: s.activeRecipe,
    },
    messages: s.messages,
  }
}

export function _readPromptForSmoke(): string {
  return loadSystemPrompt()
}
