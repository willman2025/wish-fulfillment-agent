import {
  CELEBRATION_COPY,
  type SessionState,
  type ToolCall,
  type ToolResult,
  type Recipe,
} from './types'
import { uid } from './store'
import {
  classifyWishDomain,
  deriveDefaultAnchor,
  deriveDoneLooksLike,
  deriveTinyAction,
  isFillerAction,
} from './domain'

function appendEvent(
  state: SessionState,
  type: SessionState['events'][number]['type'],
  payload?: Record<string, unknown>,
): SessionState {
  return {
    ...state,
    events: [
      ...state.events,
      {
        id: uid('evt'),
        type,
        at: new Date().toISOString(),
        payload,
      },
    ],
  }
}

function addMessage(
  state: SessionState,
  role: 'coach' | 'user' | 'system',
  text: string,
): SessionState {
  let next = {
    ...state,
    messages: [
      ...state.messages,
      {
        id: uid('msg'),
        role,
        text,
        at: new Date().toISOString(),
      },
    ],
  }
  next = appendEvent(next, 'message_sent', { role })
  return next
}

function reject(reason: string, userMessage: string): ToolResult {
  return { ok: false, reason, userMessage }
}

export function executeTool(
  state: SessionState,
  call: ToolCall,
): { state: SessionState; result: ToolResult } {
  const args = call.args ?? {}

  switch (call.name) {
    case 'utter': {
      const text = String(args.text ?? '').trim()
      if (!text) return { state, result: reject('empty_utter', '我在，你继续说就好。') }
      return { state: addMessage(state, 'coach', text), result: { ok: true } }
    }

    case 'set_draft': {
      const next: SessionState = {
        ...state,
        draftWish: args.wish !== undefined ? String(args.wish) : state.draftWish,
        draftDoneLooksLike:
          args.doneLooksLike !== undefined
            ? String(args.doneLooksLike)
            : state.draftDoneLooksLike,
        draftBehavior:
          args.behavior !== undefined ? String(args.behavior) : state.draftBehavior,
        draftAnchor:
          args.anchor !== undefined ? String(args.anchor) : state.draftAnchor,
        clarifyingStep:
          args.clarifyingStep !== undefined
            ? (args.clarifyingStep as SessionState['clarifyingStep'])
            : state.clarifyingStep,
      }
      return { state: next, result: { ok: true } }
    }

    case 'confirm_wish': {
      if (state.wish) {
        return {
          state,
          result: reject('wish_exists', '这个愿望已经锁定了，我们先把眼前这一步做完。'),
        }
      }
      if (state.exploreUserTurns < 2) {
        return {
          state: appendEvent(state, 'tool_rejected', {
            tool: 'confirm_wish',
            reason: 'explore_lt_2',
          }),
          result: reject(
            'explore_lt_2',
            '我们再多聊一轮：这件事为什么对你重要，或者什么时候你几乎一定能做一点点？',
          ),
        }
      }
      const text = String(args.text ?? state.draftWish).trim()
      if (!text) {
        return { state, result: reject('no_wish_text', '先告诉我你想靠近的是什么。') }
      }
      const doneLooksLike =
        String(args.doneLooksLike ?? state.draftDoneLooksLike).trim() ||
        deriveDoneLooksLike(text)

      let next: SessionState = {
        ...state,
        wish: {
          text,
          doneLooksLike,
          confirmedAt: new Date().toISOString(),
        },
        wantToDo: true,
        clarifyingStep: 'done',
        draftWish: text,
        draftDoneLooksLike: doneLooksLike,
      }
      next = appendEvent(next, 'wish_confirmed', { text, doneLooksLike })
      next = addMessage(
        next,
        'coach',
        `好，愿望锁定了：\n「${text}」\n完成时看起来像：${doneLooksLike}`,
      )
      return { state: next, result: { ok: true } }
    }

    case 'issue_recipe': {
      if (!state.wish) {
        return {
          state: appendEvent(state, 'tool_rejected', {
            tool: 'issue_recipe',
            reason: 'no_wish',
          }),
          result: reject('no_wish', '还没锁定愿望，先聊聊你真正想靠近的事。'),
        }
      }
      if (!state.wantToDo) {
        return {
          state: appendEvent(state, 'tool_rejected', {
            tool: 'issue_recipe',
            reason: 'not_want_to_do',
          }),
          result: reject(
            'not_want_to_do',
            '你还没说「想去做」。确认想做之后，我再给你那一小步。',
          ),
        }
      }
      if (state.exploreUserTurns < 2) {
        return {
          state: appendEvent(state, 'tool_rejected', {
            tool: 'issue_recipe',
            reason: 'explore_lt_2',
          }),
          result: reject('explore_lt_2', '我们再探索一轮，再给你那一小步。'),
        }
      }
      if (state.activeRecipeId) {
        return {
          state,
          result: reject('active_exists', '已经有进行中的小配方了。太难就跟我说「想换」。'),
        }
      }

      const wishText = state.wish.text
      let action =
        String(args.action ?? state.draftBehavior).trim() || deriveTinyAction(wishText)
      let anchor =
        String(args.anchor ?? state.draftAnchor).trim() || deriveDefaultAnchor(wishText)
      const durationMin = Math.min(
        2,
        Math.max(1, Math.round(Number(args.durationMin ?? 2))),
      )

      if (
        classifyWishDomain(wishText) === 'venture' &&
        isFillerAction(action)
      ) {
        return {
          state: appendEvent(state, 'tool_rejected', {
            tool: 'issue_recipe',
            reason: 'filler_banned',
          }),
          result: reject(
            'filler_banned',
            '这一步和愿望不太贴。我们换一个更靠近副业本身的小动作。',
          ),
        }
      }
      if (isFillerAction(action) && classifyWishDomain(wishText) !== 'tidy') {
        action = deriveTinyAction(wishText)
        anchor = deriveDefaultAnchor(wishText)
      }

      const recipe: Recipe = {
        id: uid('recipe'),
        anchor,
        action,
        durationMin,
        difficulty: 1,
        status: 'active',
        issuedAt: new Date().toISOString(),
      }

      const coachText = [
        '【今日小配方】',
        `锚点：${recipe.anchor}`,
        `动作：${recipe.action}`,
        `时长：约 ${recipe.durationMin} 分钟 · 难度 1`,
        '',
        '这是小但认真的第一步。做完跟我说「做成了」。太难或卡住了，直接说「想换」。',
      ].join('\n')

      let next: SessionState = {
        ...state,
        phase: 'recipe_active',
        recipes: [...state.recipes, recipe],
        activeRecipeId: recipe.id,
      }
      next = appendEvent(next, 'recipe_issued', {
        recipeId: recipe.id,
        anchor,
        action,
        durationMin,
      })
      next = addMessage(next, 'coach', coachText)
      return { state: next, result: { ok: true } }
    }

    case 'complete_recipe': {
      const active = state.recipes.find((r) => r.id === state.activeRecipeId)
      if (!active || state.phase !== 'recipe_active') {
        return {
          state,
          result: reject('no_active', '现在没有进行中的配方。'),
        }
      }
      const completed: Recipe = {
        ...active,
        status: 'completed',
        completedAt: new Date().toISOString(),
      }
      let next: SessionState = {
        ...state,
        recipes: state.recipes.map((r) => (r.id === completed.id ? completed : r)),
        activeRecipeId: null,
        phase: 'celebrating',
      }
      next = appendEvent(next, 'recipe_completed', { recipeId: completed.id })
      next = appendEvent(next, 'celebration_triggered', { copy: CELEBRATION_COPY })
      next = addMessage(next, 'system', CELEBRATION_COPY)
      next = addMessage(
        next,
        'coach',
        `${CELEBRATION_COPY}\n\n这一下已经够了。若要结束，回我「先不做」即可。`,
      )
      return { state: next, result: { ok: true } }
    }

    case 'adjust_recipe': {
      const active = state.recipes.find((r) => r.id === state.activeRecipeId)
      if (!active || state.phase !== 'recipe_active') {
        return {
          state,
          result: reject('no_active', '当前没有进行中的配方。'),
        }
      }
      const reason = String(args.reason ?? '想换一个更小的')
      const wishText = state.wish?.text ?? state.draftWish
      const smallerAction =
        String(args.action ?? '').trim() ||
        (classifyWishDomain(wishText) === 'venture'
          ? '打开备忘录，只写下副业想帮谁'
          : '打开备忘录，写下「今天最小的一步是：______」')
      const smallerAnchor =
        String(args.anchor ?? '').trim() || deriveDefaultAnchor(wishText)

      const superseded: Recipe = {
        ...active,
        status: 'superseded',
        supersededAt: new Date().toISOString(),
      }
      let next: SessionState = {
        ...state,
        recipes: state.recipes.map((r) => (r.id === active.id ? superseded : r)),
        activeRecipeId: null,
      }
      next = appendEvent(next, 'recipe_superseded', { recipeId: active.id, reason })
      next = appendEvent(next, 'recipe_adjusted', { reason })
      next = addMessage(
        next,
        'coach',
        `没关系，我们把配方再缩小一点（原因：${reason}）。旧的已作废——仍然朝着同一个愿望。`,
      )

      const issued = executeTool(next, {
        name: 'issue_recipe',
        args: { action: smallerAction, anchor: smallerAnchor, durationMin: 1 },
      })
      return issued
    }

    case 'end_session': {
      if (state.phase === 'ended') return { state, result: { ok: true } }
      let next: SessionState = { ...state, phase: 'ended', activeRecipeId: null }
      if (state.activeRecipeId) {
        next = {
          ...next,
          recipes: next.recipes.map((r) =>
            r.id === state.activeRecipeId && r.status === 'active'
              ? {
                  ...r,
                  status: 'superseded' as const,
                  supersededAt: new Date().toISOString(),
                }
              : r,
          ),
        }
      }
      next = appendEvent(next, 'session_ended')
      next = addMessage(
        next,
        'coach',
        '好，先到这里。你已经迈出了一步。随时回来，我们继续把日子一点点拉回正轨。',
      )
      return { state: next, result: { ok: true } }
    }

    default:
      return { state, result: reject('unknown_tool', '我这边卡了一下，你再说一遍好吗？') }
  }
}
