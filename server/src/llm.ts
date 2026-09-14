import type { ReasonOutput, SessionState } from './types'
import {
  deriveDefaultAnchor,
  deriveDoneLooksLike,
  deriveTinyAction,
} from './domain'

export interface LlmClient {
  reason(input: {
    state: SessionState
    userMessage: string
    lastReject?: { tool: string; reason: string; userMessage?: string }
  }): Promise<ReasonOutput>
}

function wantsToDo(msg: string): boolean {
  return /想去做|就是这个|就是它|现在就想做/.test(msg)
}

function wantsComplete(msg: string): boolean {
  return /做成了|做完了|完成了|我做成了/.test(msg)
}

function wantsAdjust(msg: string): boolean {
  return /太难|没做成|卡住|想换|换一个/.test(msg)
}

function wantsEnd(msg: string): boolean {
  return /先不做|结束|下次再说/.test(msg)
}

/** Deterministic mock brain — never writes state directly. */
export class MockLlm implements LlmClient {
  async reason({
    state,
    userMessage,
    lastReject,
  }: {
    state: SessionState
    userMessage: string
    lastReject?: { tool: string; reason: string; userMessage?: string }
  }): Promise<ReasonOutput> {
    if (lastReject) {
      return {
        tool_calls: [
          {
            name: 'utter',
            args: {
              text:
                lastReject.userMessage ??
                '我们换个说法继续：你现在最想靠近的是什么？',
            },
          },
        ],
      }
    }

    const msg = userMessage.trim()
    if (wantsEnd(msg)) return { tool_calls: [{ name: 'end_session' }] }

    if (state.phase === 'ended') {
      return {
        tool_calls: [
          { name: 'utter', args: { text: '会话已结束。想再开始时开一个新 session 就好。' } },
        ],
      }
    }

    if (state.phase === 'celebrating') {
      return {
        tool_calls: [
          {
            name: 'utter',
            args: { text: '这一下已经够了。想结束就说「先不做」。' },
          },
        ],
      }
    }

    if (state.phase === 'recipe_active') {
      if (wantsComplete(msg)) return { tool_calls: [{ name: 'complete_recipe' }] }
      if (wantsAdjust(msg)) {
        return { tool_calls: [{ name: 'adjust_recipe', args: { reason: msg } }] }
      }
      return {
        tool_calls: [
          {
            name: 'utter',
            args: { text: '配方还在。做完说「做成了」；太难就说「想换」。' },
          },
        ],
      }
    }

    if (state.clarifyingStep === 'wishing' || !state.draftWish) {
      return {
        tool_calls: [
          {
            name: 'set_draft',
            args: {
              wish: msg,
              clarifyingStep: 'exploring',
              doneLooksLike: deriveDoneLooksLike(msg),
            },
          },
          {
            name: 'utter',
            args: {
              text: `我听到了：「${msg}」。\n\n现在最卡/最疼的是什么？或者：这件事对你真正意味着什么？`,
            },
          },
        ],
      }
    }

    if (state.clarifyingStep === 'exploring' && state.exploreUserTurns < 2) {
      return {
        tool_calls: [
          {
            name: 'set_draft',
            args: {
              behavior: deriveTinyAction(state.draftWish),
              anchor: deriveDefaultAnchor(state.draftWish),
            },
          },
          {
            name: 'utter',
            args: {
              text: '明白。什么时候你几乎一定能做一点点？什么情况会让你不想动？',
            },
          },
        ],
      }
    }

    if (state.clarifyingStep === 'exploring' && state.exploreUserTurns >= 2) {
      return {
        tool_calls: [
          {
            name: 'set_draft',
            args: {
              clarifyingStep: 'confirming',
              behavior: deriveTinyAction(state.draftWish),
              anchor: deriveDefaultAnchor(state.draftWish),
              doneLooksLike: deriveDoneLooksLike(state.draftWish),
            },
          },
          {
            name: 'utter',
            args: {
              text: `听起来你想靠近的是：「${state.draftWish}」。\n\n如果现在就想做，回我「想去做」或「就是这个」。确认之前我不会给出那一步。`,
            },
          },
        ],
      }
    }

    if (wantsToDo(msg)) {
      return {
        tool_calls: [
          {
            name: 'confirm_wish',
            args: {
              text: state.draftWish,
              doneLooksLike:
                state.draftDoneLooksLike || deriveDoneLooksLike(state.draftWish),
            },
          },
          {
            name: 'issue_recipe',
            args: {
              action: state.draftBehavior || deriveTinyAction(state.draftWish),
              anchor: state.draftAnchor || deriveDefaultAnchor(state.draftWish),
              durationMin: 2,
            },
          },
        ],
      }
    }

    return {
      tool_calls: [
        { name: 'set_draft', args: { clarifyingStep: 'confirming' } },
        {
          name: 'utter',
          args: {
            text: '可以。等你说「想去做」，我再给你那一小步；现在先不用着急。',
          },
        },
      ],
    }
  }
}

export class RealLlm implements LlmClient {
  async reason(): Promise<ReasonOutput> {
    throw new Error(
      'RealLlm not configured. Set LLM_API_KEY / LLM_BASE_URL / LLM_MODEL, or use MockLlm.',
    )
  }
}

export function createLlm(): LlmClient {
  if (process.env.LLM_API_KEY) return new RealLlm()
  return new MockLlm()
}
