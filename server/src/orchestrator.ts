import type { LlmClient } from './llm'
import { createSession, getSession, saveSession, uid } from './store'
import { executeTool } from './tools'
import type { SessionState, TurnResponse } from './types'

function addUserMessage(state: SessionState, text: string): SessionState {
  let next: SessionState = {
    ...state,
    messages: [
      ...state.messages,
      {
        id: uid('msg'),
        role: 'user',
        text,
        at: new Date().toISOString(),
      },
    ],
  }
  if (state.phase === 'clarifying' && state.clarifyingStep === 'exploring') {
    next = { ...next, exploreUserTurns: state.exploreUserTurns + 1 }
  }
  return next
}

export async function runTurn(
  llm: LlmClient,
  opts: { sessionId?: string; message: string },
): Promise<TurnResponse> {
  let state = opts.sessionId ? getSession(opts.sessionId) : undefined
  if (!state) state = createSession()

  const message = opts.message.trim()
  state = addUserMessage(state, message)

  const rejected: Array<{ tool: string; reason: string }> = []
  let lastReject:
    | { tool: string; reason: string; userMessage?: string }
    | undefined

  let output = await llm.reason({ state, userMessage: message })

  const applyCalls = (calls: typeof output.tool_calls) => {
    for (const call of calls) {
      const { state: next, result } = executeTool(state!, call)
      state = next
      if (!result.ok) {
        rejected.push({ tool: call.name, reason: result.reason ?? 'rejected' })
        lastReject = {
          tool: call.name,
          reason: result.reason ?? 'rejected',
          userMessage: result.userMessage,
        }
        break
      }
    }
  }

  applyCalls(output.tool_calls)

  if (lastReject) {
    output = await llm.reason({
      state,
      userMessage: message,
      lastReject,
    })
    lastReject = undefined
    applyCalls(output.tool_calls)
  }

  saveSession(state)

  const lastCoach = [...state.messages].reverse().find((m) => m.role === 'coach')
  return {
    sessionId: state.id,
    utterance: lastCoach?.text ?? '',
    state,
    rejected: rejected.length ? rejected : undefined,
  }
}
