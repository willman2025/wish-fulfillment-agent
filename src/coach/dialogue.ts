import type { SessionState } from '../types'
import {
  addMessage,
  adjustRecipe,
  completeRecipe,
  confirmWish,
  endSession,
} from '../state/session'

/** Detect adjust intent: 太难 / 没做成 / 卡住 / 想换 */
export function detectAdjustIntent(text: string): string | null {
  const t = text.trim()
  if (/太难|很难|好难/.test(t)) return '太难'
  if (/没做成|没做完|做不到|失败|做不了/.test(t)) return '没做成'
  if (/卡住|卡死|动不了|不知道怎么/.test(t)) return '卡住'
  if (/想换|换一个|换个|重新给|改一下|换配方/.test(t)) return '想换'
  return null
}

export function detectEndIntent(text: string): boolean {
  return /先不做|不想做了|结束|下次再说|算了/.test(text.trim())
}

export function detectCompleteIntent(text: string): boolean {
  return /做成了|做完了|完成了|我做完|搞定了/.test(text.trim())
}

export function detectConfirmIntent(text: string): boolean {
  return /^(确认|好的?|可以|就这个|对|是的|嗯|ok|OK)$/i.test(text.trim()) ||
    /确认愿望|就这个愿望/.test(text)
}

function refineWish(raw: string): { wish: string; doneLooksLike: string } {
  const cleaned = raw.replace(/^我想/, '').replace(/^想/, '').trim() || raw.trim()
  const wish = cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned
  let doneLooksLike = '你已经开始朝这个方向动了一下'
  if (/运动|跑|走|健身/.test(wish)) doneLooksLike = '你已经穿好鞋或站起来准备动了'
  else if (/学|读|书/.test(wish)) doneLooksLike = '学习材料已经打开在眼前'
  else if (/整理|打扫/.test(wish)) doneLooksLike = '眼前有一小块地方变干净了'
  else if (/精神|节奏|作息|正轨/.test(wish)) doneLooksLike = '你完成了一个微小的日常动作'
  else if (/写|日记/.test(wish)) doneLooksLike = '备忘录里多了一句话'
  return { wish: `想${wish.startsWith('想') ? wish.slice(1) : wish}`, doneLooksLike }
}

/**
 * Process one user utterance and advance the closed loop.
 */
export function handleUserMessage(
  state: SessionState,
  rawText: string,
): SessionState {
  const text = rawText.trim()
  if (!text) return state
  if (state.phase === 'ended') {
    return addMessage(
      state,
      'coach',
      '本会话已结束。点右上角「新会话」可以重新开始。',
    )
  }

  let next = addMessage(state, 'user', text)

  if (detectEndIntent(text)) {
    return endSession(next)
  }

  if (next.phase === 'recipe_active') {
    if (detectCompleteIntent(text)) {
      return completeRecipe(next)
    }
    const adjustReason = detectAdjustIntent(text)
    if (adjustReason) {
      return adjustRecipe(next, adjustReason)
    }
    return addMessage(
      next,
      'coach',
      '配方还在等你。做成了就点「我做成了」；若太难、卡住或想换，直接说就行。也可以说「先不做」结束。',
    )
  }

  if (next.phase === 'celebrating') {
    const adjustReason = detectAdjustIntent(text)
    if (adjustReason) {
      return addMessage(
        next,
        'coach',
        '你今天已经完成过一次了，够了。休息一下；若要新会话，点「新会话」。',
      )
    }
    return addMessage(
      next,
      'coach',
      '今天这件小事已经做成了。好好歇着。想再开一轮就点「新会话」。',
    )
  }

  // clarifying
  return handleClarifying(next, text)
}

function handleClarifying(state: SessionState, text: string): SessionState {
  const step = state.clarifyingStep

  if (step === 'awaiting_direction') {
    const { wish, doneLooksLike } = refineWish(text)
    let next: SessionState = {
      ...state,
      clarifyingStep: 'confirming',
      draftWish: wish,
      draftDoneLooksLike: doneLooksLike,
    }
    next = addMessage(
      next,
      'coach',
      `我帮你收成一个具体愿望：\n\n愿望：${wish}\n完成时看起来像：${doneLooksLike}\n\n可以吗？回「确认」锁定；或者直接改写成你更想要的说法。`,
    )
    return next
  }

  if (step === 'confirming' || step === 'refining') {
    if (detectConfirmIntent(text)) {
      const wish = state.draftWish || text
      const done = state.draftDoneLooksLike || '你完成了一个微小动作'
      return confirmWish(state, wish, done)
    }
    // User rewrote the wish
    const { wish, doneLooksLike } = refineWish(text)
    let next: SessionState = {
      ...state,
      clarifyingStep: 'confirming',
      draftWish: wish,
      draftDoneLooksLike: doneLooksLike,
    }
    next = addMessage(
      next,
      'coach',
      `收到，改成这样：\n\n愿望：${wish}\n完成时看起来像：${doneLooksLike}\n\n回「确认」锁定，或继续改。`,
    )
    return next
  }

  return addMessage(state, 'coach', '说说你想拉回来的那个方向吧。')
}
