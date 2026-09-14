import type { SessionState } from '../types'
import {
  addMessage,
  adjustRecipe,
  completeRecipe,
  confirmWish,
  deriveDefaultAnchor,
  deriveDoneLooksLike,
  deriveTinyAction,
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

/** 「想做」intent — stronger than bare 确认/好 */
export function detectWantToDoIntent(text: string): boolean {
  const t = text.trim()
  if (
    /想去做|就是这个|我愿意做|就这个我想做|开始做吧|对就这个|就这个吧|我想做|愿意做|可以开始|开始吧/.test(
      t,
    )
  ) {
    return true
  }
  // Bare confirm only counts when drafts are already concrete (checked by caller)
  if (/^(确认|好的?|可以|对|是的|嗯|ok|OK|就这个)$/i.test(t)) return true
  if (/确认愿望|就这个愿望/.test(t)) return true
  return false
}

function lightCleanWish(raw: string): string {
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^(我想|我想要|想要|想)/, '').trim() || raw.trim()
  if (cleaned.length > 48) cleaned = cleaned.slice(0, 48)
  if (!cleaned.startsWith('想')) cleaned = `想${cleaned}`
  return cleaned
}

function looksLikeRewriteAspiration(text: string): boolean {
  return /其实我想|我真正想|换个愿|不是这个|我想的是|重新许|其实是/.test(text)
}

function detectReadinessSignal(text: string): boolean {
  return /可以给我|给我一个|小步骤|第一步|怎么开始|想开始|可以开始|有具体|差不多了|就这样/.test(
    text,
  )
}

/** Grow drafts from conversation — semantic, not template spam. */
function growDraftsFromUtterance(
  state: SessionState,
  text: string,
): Pick<
  SessionState,
  'draftWish' | 'draftDoneLooksLike' | 'draftBehavior' | 'draftAnchor'
> {
  const draftWish = state.draftWish || lightCleanWish(text)
  const combined = `${draftWish} ${text}`

  let draftBehavior = state.draftBehavior
  let draftAnchor = state.draftAnchor
  let draftDoneLooksLike = state.draftDoneLooksLike

  // User may name a concrete tiny action
  if (
    /站|走|穿|打开|写|清理|喝|呼吸|看|叠|放回|拉伸|读|打开/.test(text) &&
    text.length < 40 &&
    !/为什么|感觉|意义|重要/.test(text)
  ) {
    // Prefer short action-like utterances as behavior candidates
    if (/穿鞋|运动鞋|站在|原地|散步|拉伸/.test(text)) {
      draftBehavior = text.replace(/^(我想|想)/, '').trim() || draftBehavior
    } else if (/打开.*(书|材料|课|备忘)/.test(text)) {
      draftBehavior = text.replace(/^(我想|想)/, '').trim() || draftBehavior
    } else if (/清理|整理|叠/.test(text)) {
      draftBehavior = text.replace(/^(我想|想)/, '').trim() || draftBehavior
    } else if (/窗边|喝水|深呼吸|早起/.test(text)) {
      draftBehavior = text.replace(/^(我想|想)/, '').trim() || draftBehavior
    }
  }

  if (!draftBehavior) {
    draftBehavior = deriveTinyAction(combined)
  }
  if (!draftAnchor) {
    // Capture anchor phrases if user mentions routine
    const anchorMatch = text.match(
      /(刷完牙后|起床后|坐下后|打开电脑后|喝完.*后|进门后|吃完.*后)/,
    )
    draftAnchor = anchorMatch?.[1] ?? deriveDefaultAnchor(combined)
  }
  if (!draftDoneLooksLike) {
    draftDoneLooksLike = deriveDoneLooksLike(combined)
  }

  // Refine wish wording if user elaborates meaning
  let nextWish = draftWish
  if (text.length > 4 && text.length < 60 && /想|希望|变得|重新|有点/.test(text)) {
    if (!state.draftWish || text.length > state.draftWish.length) {
      // Soft update only when exploring elaborates
      if (/精神|运动|学|整理|写|联系|节奏|作息|能量/.test(text)) {
        nextWish = lightCleanWish(text)
      }
    }
  }

  return {
    draftWish: nextWish,
    draftDoneLooksLike,
    draftBehavior,
    draftAnchor,
  }
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

  // --- wishing: first user message = aspiration ---
  if (step === 'wishing') {
    const draftWish = lightCleanWish(text)
    const drafts = growDraftsFromUtterance(
      {
        ...state,
        draftWish,
        draftDoneLooksLike: '',
        draftBehavior: '',
        draftAnchor: '',
      },
      text,
    )
    let next: SessionState = {
      ...state,
      clarifyingStep: 'exploring',
      exploreUserTurns: 0,
      draftWish: drafts.draftWish,
      draftDoneLooksLike: drafts.draftDoneLooksLike,
      draftBehavior: drafts.draftBehavior,
      draftAnchor: drafts.draftAnchor,
    }
    next = addMessage(
      next,
      'coach',
      `收到：「${drafts.draftWish}」。先不用急着定死。\n\n这个愿望对你来说，重要的是哪一块？做成之后，你希望自己是什么感觉？`,
    )
    return next
  }

  // --- exploring: multi-turn; gate confirming until exploreUserTurns >= 2 ---
  if (step === 'exploring') {
    const exploreUserTurns = state.exploreUserTurns + 1
    const drafts = growDraftsFromUtterance(state, text)
    let next: SessionState = {
      ...state,
      exploreUserTurns,
      ...drafts,
    }

    const concrete = Boolean(
      drafts.draftWish.trim() && drafts.draftBehavior.trim(),
    )
    const userStillExploring =
      /还没想好|再说说|不确定|继续聊|再想想|为什么|感觉/.test(text) &&
      !detectReadinessSignal(text) &&
      !detectWantToDoIntent(text)

    // Hard gate: before 2 turns, stay exploring — never confirmWish
    if (
      exploreUserTurns < 2 ||
      !concrete ||
      (userStillExploring && !detectReadinessSignal(text))
    ) {
      const coachReply =
        exploreUserTurns === 1
          ? `嗯，我听到了。\n\n如果把它再往「能动手」的方向收一点：你愿意先从哪个很小的动作试一下？比如跟「${drafts.draftWish}」有关的、一两分钟内能做完的那种。也可以继续说说你在意什么。`
          : `慢慢清楚了。朝「${drafts.draftWish}」靠近时，一个小但认真的起点可以是：\n\n锚点：${drafts.draftAnchor}\n动作：${drafts.draftBehavior}\n\n你还想再改改，还是我们已经摸到你「想去做」的那个点了？`

      next = addMessage(next, 'coach', coachReply)
      return next
    }

    // Move to confirming with reflection
    next = {
      ...next,
      clarifyingStep: 'confirming',
    }
    next = addMessage(
      next,
      'coach',
      `我把它收成这样，请你看一眼：\n\n愿望：${drafts.draftWish}\n完成时看起来像：${drafts.draftDoneLooksLike}\n小但认真的第一步：${drafts.draftAnchor}，${drafts.draftBehavior}\n\n如果就是这个、你想去做，回我「想去做」或「就是这个」。想改就直接说怎么改。`,
    )
    return next
  }

  // --- confirming: only confirmWish on clear want-to-do ---
  if (step === 'confirming') {
    if (looksLikeRewriteAspiration(text)) {
      const drafts = growDraftsFromUtterance(
        {
          ...state,
          draftWish: '',
          draftBehavior: '',
          draftAnchor: '',
          draftDoneLooksLike: '',
        },
        text,
      )
      let next: SessionState = {
        ...state,
        clarifyingStep: 'exploring',
        exploreUserTurns: Math.max(state.exploreUserTurns, 2),
        ...drafts,
        draftWish: lightCleanWish(text),
      }
      next = addMessage(
        next,
        'coach',
        `好，我们重新展开：「${next.draftWish}」。\n\n这一次你最在意的是什么感觉或哪一块？`,
      )
      return next
    }

    const bareOk = /^(确认|好的?|可以|对|是的|嗯|ok|OK)$/i.test(text.trim())
    const want =
      detectWantToDoIntent(text) &&
      (!bareOk ||
        (state.exploreUserTurns >= 2 &&
          Boolean(state.draftWish && state.draftBehavior)))

    // Strong want-to-do phrases always count when drafts exist
    const strongWant =
      /想去做|就是这个|我愿意做|就这个我想做|开始做吧|对就这个|可以开始|开始吧/.test(
        text.trim(),
      )

    if (
      (strongWant || want) &&
      state.draftWish.trim() &&
      (state.draftBehavior.trim() || state.draftDoneLooksLike.trim())
    ) {
      const done =
        state.draftDoneLooksLike || deriveDoneLooksLike(state.draftWish)
      const action = state.draftBehavior || deriveTinyAction(state.draftWish)
      const anchor = state.draftAnchor || deriveDefaultAnchor(state.draftWish)
      return confirmWish(state, state.draftWish, done, {
        action,
        anchor,
        durationMin: 2,
      })
    }

    // User rewrote details — stay confirming, update drafts
    const drafts = growDraftsFromUtterance(state, text)
    // If they named a new wish-like sentence, update wish
    let draftWish = drafts.draftWish
    if (text.length > 2 && text.length < 48 && /想/.test(text)) {
      draftWish = lightCleanWish(text)
    }
    let next: SessionState = {
      ...state,
      draftWish,
      draftDoneLooksLike: drafts.draftDoneLooksLike,
      draftBehavior: drafts.draftBehavior || deriveTinyAction(draftWish),
      draftAnchor: drafts.draftAnchor || deriveDefaultAnchor(draftWish),
    }
    next = addMessage(
      next,
      'coach',
      `收到，先改成：\n\n愿望：${next.draftWish}\n小步骤：${next.draftAnchor}，${next.draftBehavior}\n\n若就是这个、想去做，回「想去做」；继续改也行。`,
    )
    return next
  }

  return addMessage(
    state,
    'coach',
    '先随便许一个愿吧，可以很模糊——我们慢慢聊清楚。',
  )
}

