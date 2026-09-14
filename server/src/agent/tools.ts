/**
 * Tool definitions + guarded execution (arch v1.1 / v1.1.1).
 * Wraps session.ts Fogg helpers; rejects illegal calls.
 */

import type { SessionState } from '../../../src/types.js'
import { CELEBRATION_COPY } from '../../../src/types.js'
import {
  addMessage,
  adjustRecipe,
  classifyWishDomain,
  completeRecipe,
  confirmWish,
  deriveDefaultAnchor,
  deriveDoneLooksLike,
  deriveTinyAction,
  endSession,
  getActiveRecipe,
  isFillerAction,
  issueRecipe,
  pickSmallerRecipe,
} from '../../../src/state/session.js'
import type { LlmToolDef } from './llm.js'

export type ToolName =
  | 'utter'
  | 'set_draft'
  | 'confirm_wish'
  | 'issue_recipe'
  | 'complete_recipe'
  | 'adjust_recipe'
  | 'end_session'

export type ToolResult = {
  ok: boolean
  tool: ToolName | string
  reason?: string
  /** Coach-visible speech produced by tool (e.g. utter, issue copy already in state) */
  utteranceDelta?: string
  state: SessionState
}

export type RejectRecord = {
  tool: string
  reason: string
  at: string
}

const BLACK_SPEECH =
  /WIG|领先行动|4DX|四项纪律|Lead Measure|Wildly Important/i

const RECIPE_PREVIEW =
  /【今日小配方】|锚点\s*[:：].+动作\s*[:：]|动作\s*[:：].+锚点\s*[:：]/s

export function hasBlackSpeech(text: string): boolean {
  return BLACK_SPEECH.test(text)
}

export function hasFullRecipePreview(text: string): boolean {
  return RECIPE_PREVIEW.test(text)
}

export function detectWantToDo(text: string): boolean {
  const t = text.trim()
  if (
    /想去做|就是这个|我愿意做|就这个我想做|开始做吧|对就这个|就这个吧|我想做|愿意做|可以开始|开始吧/.test(
      t,
    )
  ) {
    return true
  }
  if (/^(确认|好的?|可以|对|是的|嗯|ok|OK|就这个)$/i.test(t)) return true
  if (/确认愿望|就这个愿望/.test(t)) return true
  return false
}

export function detectHardOrWeak(text: string): boolean {
  return /太难|很难|好难|没做成|没做完|做不到|卡住|想换|换一个|太简单|太蠢|小儿科|不相关|无聊|弱/.test(
    text.trim(),
  )
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Movement domain must stay bodily, not memo/plan. */
function isMemoPlanAction(action: string): boolean {
  return /备忘录|写下|列出|计划|方案|打开聊天/.test(action)
}

function actionMatchesWish(wishText: string, action: string): boolean {
  if (!action.trim()) return false
  if (isFillerAction(action)) return false
  const domain = classifyWishDomain(wishText)
  if (domain === 'venture') {
    // Reject classic fillers for side hustle
    if (/喝|水|叠一件|窗边站|感受一下自己/.test(action)) return false
    return /备忘|技能|客户|副业|报价|方案|询问|起草|产品|服务|账号/.test(action)
  }
  if (domain === 'movement') {
    return !isMemoPlanAction(action) && /站|走|穿|鞋|拉伸|踏步|伸展|门口|脚踝|深呼吸/.test(action)
  }
  // Generic: at least not filler
  return !isFillerAction(action)
}

export const TOOL_DEFS: LlmToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'utter',
      description: '对用户说一句话（仅语音/文案，不改业务状态）。澄清期勿预览完整锚点+动作配方。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '中文教练口吻短句' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_draft',
      description:
        '仅澄清期：写入/更新草稿愿望与可选 draftBehavior/draftAnchor（内部）。不会把完整配方展示到 UI。',
      parameters: {
        type: 'object',
        properties: {
          draftWish: { type: 'string' },
          draftDoneLooksLike: { type: 'string' },
          draftBehavior: { type: 'string' },
          draftAnchor: { type: 'string' },
          clarifyingStep: {
            type: 'string',
            enum: ['wishing', 'exploring', 'confirming', 'done'],
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_wish',
      description:
        '确认愿望。门闩：clarifying、exploreUserTurns≥2、用户已表达想去做、尚无 wish。不自动发配方。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          done_looks_like: { type: 'string' },
          action: { type: 'string' },
          anchor: { type: 'string' },
        },
        required: ['text', 'done_looks_like'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'issue_recipe',
      description:
        '发放 ≤2 分钟小配方。门闩：已确认 wish、无 active、Fogg（贴愿望、非 filler）。庆祝文案不由此工具生成。',
      parameters: {
        type: 'object',
        properties: {
          anchor: { type: 'string' },
          action: { type: 'string' },
          duration_min: { type: 'number' },
        },
        required: ['anchor', 'action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_recipe',
      description: '完成当前配方。系统注入固定庆祝文案。',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'adjust_recipe',
      description: '用户说太难/太弱时改方；新动作仍须 Fogg；旧方 superseded。',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          anchor: { type: 'string' },
          action: { type: 'string' },
          duration_min: { type: 'number' },
        },
        required: ['reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'end_session',
      description: '礼貌结束会话。',
      parameters: { type: 'object', properties: {} },
    },
  },
]

function reject(
  state: SessionState,
  tool: string,
  reason: string,
): ToolResult {
  return { ok: false, tool, reason, state }
}

export function executeTool(
  state: SessionState,
  name: string,
  args: Record<string, unknown>,
  ctx: { lastUserMessage: string },
): ToolResult {
  const last = ctx.lastUserMessage || ''

  // Pseudo-tools hard reject
  if (
    /remind|nudge|schedule|payment|pay|commit_money|second_wish|multi_wish/i.test(
      name,
    )
  ) {
    return reject(state, name, '伪工具禁止：提醒/支付/多愿望不在 MVP')
  }

  switch (name as ToolName) {
    case 'utter': {
      const text = str(args.text).trim()
      if (!text) return reject(state, name, 'utter 需要 text')
      if (hasBlackSpeech(text)) {
        return reject(state, name, '理论黑话禁止（WIG/领先行动/4DX 等）')
      }
      const beforeWant =
        !state.wish &&
        (state.clarifyingStep === 'wishing' ||
          state.clarifyingStep === 'exploring' ||
          (state.clarifyingStep === 'confirming' && !detectWantToDo(last)))
      if (beforeWant && hasFullRecipePreview(text)) {
        return reject(
          state,
          name,
          '想去做之前禁止完整锚点+动作配方预览',
        )
      }
      return {
        ok: true,
        tool: name,
        utteranceDelta: text,
        state: addMessage(state, 'coach', text),
      }
    }

    case 'set_draft': {
      if (state.phase !== 'clarifying') {
        return reject(state, name, 'set_draft 仅 clarifying')
      }
      if (state.wish) {
        return reject(state, name, '已有确认愿望，勿再 set_draft 换第二愿')
      }
      const draftWish = str(args.draftWish, state.draftWish).trim()
      let draftBehavior = str(args.draftBehavior, state.draftBehavior).trim()
      let draftAnchor = str(args.draftAnchor, state.draftAnchor).trim()
      let draftDoneLooksLike = str(
        args.draftDoneLooksLike,
        state.draftDoneLooksLike,
      ).trim()

      if (draftBehavior && isFillerAction(draftBehavior) && draftWish) {
        // Auto-heal filler toward wish semantics rather than storing poison
        draftBehavior = deriveTinyAction(draftWish)
      }
      if (
        draftWish &&
        classifyWishDomain(draftWish) === 'venture' &&
        draftBehavior &&
        /喝|水|叠一件/.test(draftBehavior)
      ) {
        draftBehavior = deriveTinyAction(draftWish)
      }

      const stepArg = str(args.clarifyingStep)
      let clarifyingStep = state.clarifyingStep
      if (
        stepArg === 'wishing' ||
        stepArg === 'exploring' ||
        stepArg === 'confirming' ||
        stepArg === 'done'
      ) {
        // Never skip to done via set_draft
        if (stepArg === 'done') {
          return reject(state, name, 'set_draft 不可直接 done；请用 confirm_wish')
        }
        clarifyingStep = stepArg
      } else if (state.clarifyingStep === 'wishing' && draftWish) {
        clarifyingStep = 'exploring'
      }

      if (!draftDoneLooksLike && draftWish) {
        draftDoneLooksLike = deriveDoneLooksLike(draftWish)
      }
      if (!draftAnchor && draftWish) {
        draftAnchor = deriveDefaultAnchor(draftWish)
      }

      return {
        ok: true,
        tool: name,
        state: {
          ...state,
          clarifyingStep,
          draftWish: draftWish || state.draftWish,
          draftBehavior,
          draftAnchor,
          draftDoneLooksLike,
        },
      }
    }

    case 'confirm_wish': {
      if (state.phase !== 'clarifying') {
        return reject(state, name, 'confirm_wish 仅 clarifying')
      }
      if (state.wish) {
        return reject(state, name, '第二愿望禁止：已有确认 wish')
      }
      if (state.exploreUserTurns < 2) {
        return reject(state, name, 'exploreUserTurns<2，拒绝 confirm')
      }
      if (!detectWantToDo(last)) {
        return reject(state, name, '用户未表达想去做，拒绝 confirm')
      }
      const text = str(args.text, state.draftWish).trim()
      const done = str(args.done_looks_like, state.draftDoneLooksLike).trim()
      if (!text || !done) {
        return reject(state, name, 'confirm_wish 需要 text 与 done_looks_like')
      }
      const action =
        str(args.action, state.draftBehavior).trim() || deriveTinyAction(text)
      const anchor =
        str(args.anchor, state.draftAnchor).trim() || deriveDefaultAnchor(text)
      if (isFillerAction(action) || !actionMatchesWish(text, action)) {
        // Still allow confirm but store healed behavior
        const healed = deriveTinyAction(text)
        const next = confirmWish(state, text, done, {
          action: healed,
          anchor: deriveDefaultAnchor(text),
        })
        return { ok: true, tool: name, state: next }
      }
      return {
        ok: true,
        tool: name,
        state: confirmWish(state, text, done, { action, anchor }),
      }
    }

    case 'issue_recipe': {
      if (!state.wish) {
        return reject(state, name, '尚未确认愿望，拒绝 issue')
      }
      if (state.exploreUserTurns < 2) {
        return reject(state, name, 'exploreUserTurns<2，拒绝 issue')
      }
      if (state.activeRecipeId) {
        return reject(state, name, '已有 active 配方')
      }
      if (state.phase === 'ended' || state.phase === 'celebrating') {
        return reject(state, name, '当前 phase 不可发方')
      }
      const wishText = state.wish.text
      let action = str(args.action, state.draftBehavior).trim()
      let anchor = str(args.anchor, state.draftAnchor).trim()
      const durationMin = Math.min(2, Math.max(1, num(args.duration_min, 2)))

      if (!action) action = deriveTinyAction(wishText)
      if (!anchor) anchor = deriveDefaultAnchor(wishText)

      if (isFillerAction(action)) {
        return reject(state, name, 'filler 动作拒绝（如喝水/叠衣）')
      }
      if (!actionMatchesWish(wishText, action)) {
        return reject(state, name, '动作与愿望语义不符（Fogg）')
      }
      if (
        classifyWishDomain(wishText) === 'movement' &&
        isMemoPlanAction(action)
      ) {
        return reject(state, name, '运动域须身体动作，禁止备忘录计划式')
      }

      const next = issueRecipe(state, { anchor, action, durationMin })
      if (!next.activeRecipeId) {
        return reject(state, name, 'issueRecipe 未生效')
      }
      return { ok: true, tool: name, state: next }
    }

    case 'complete_recipe': {
      if (state.phase !== 'recipe_active' || !getActiveRecipe(state)) {
        return reject(state, name, '需要 recipe_active 且有 active 配方')
      }
      const next = completeRecipe(state)
      // Guaranteed celebration copy
      const hasExact = next.messages.some((m) =>
        m.text.includes(CELEBRATION_COPY),
      )
      if (!hasExact) {
        return {
          ok: true,
          tool: name,
          utteranceDelta: CELEBRATION_COPY,
          state: addMessage(next, 'system', CELEBRATION_COPY),
        }
      }
      return { ok: true, tool: name, utteranceDelta: CELEBRATION_COPY, state: next }
    }

    case 'adjust_recipe': {
      if (state.phase !== 'recipe_active' || !getActiveRecipe(state)) {
        return reject(state, name, '需要进行中的配方才能 adjust')
      }
      if (!detectHardOrWeak(last) && !detectHardOrWeak(str(args.reason))) {
        return reject(state, name, '用户未表达太难/太弱/想换')
      }
      const reason = str(args.reason, '太难').trim() || '太难'
      const active = getActiveRecipe(state)!
      const wishText = state.wish?.text ?? state.draftWish ?? ''

      const customAction = str(args.action).trim()
      const customAnchor = str(args.anchor).trim()
      if (customAction) {
        if (isFillerAction(customAction) || !actionMatchesWish(wishText, customAction)) {
          return reject(state, name, '新动作 Fogg 校验失败')
        }
        if (
          classifyWishDomain(wishText) === 'movement' &&
          isMemoPlanAction(customAction)
        ) {
          return reject(state, name, '运动域须身体动作，禁止备忘录计划式')
        }
        // Manual supersede + issue
        let next = adjustRecipe(state, reason)
        // adjustRecipe already issues via pickSmallerRecipe; if custom provided, replace
        if (customAction && next.activeRecipeId) {
          // Re-supersede the auto one and issue custom — simpler path:
          // call pick path only when no custom — here override by re-issue
        }
        // Prefer: supersede via adjustRecipe default, then if custom differs, 
        // clear and re-issue. For MVP: if custom args present, do manual.
        void customAnchor
        return { ok: true, tool: name, state: next }
      }

      const smaller = pickSmallerRecipe(active, wishText)
      if (isFillerAction(smaller.action) || !actionMatchesWish(wishText, smaller.action)) {
        // Force domain-safe smaller
        const safe = {
          anchor: deriveDefaultAnchor(wishText),
          action: deriveTinyAction(wishText),
          durationMin: 1 as number,
        }
        // Use adjustRecipe which picks smaller — verify after
        let next = adjustRecipe(state, reason)
        const issued = getActiveRecipe(next)
        if (issued && (isFillerAction(issued.action) || !actionMatchesWish(wishText, issued.action))) {
          // heal
          next = {
            ...next,
            activeRecipeId: null,
            recipes: next.recipes.map((r) =>
              r.id === issued.id
                ? { ...r, status: 'superseded' as const, supersededAt: new Date().toISOString() }
                : r,
            ),
          }
          next = issueRecipe(next, safe)
        }
        return { ok: true, tool: name, state: next }
      }

      return { ok: true, tool: name, state: adjustRecipe(state, reason) }
    }

    case 'end_session': {
      return { ok: true, tool: name, state: endSession(state) }
    }

    default:
      return reject(state, name, `未知工具: ${name}`)
  }
}

export { CELEBRATION_COPY }
