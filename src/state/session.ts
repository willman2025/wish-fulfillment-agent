import {
  CELEBRATION_COPY,
  STORAGE_KEY,
  type Recipe,
  type SessionState,
  type Wish,
} from '../types'
import { appendEvent } from './events'

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function createInitialState(): SessionState {
  const opening =
    '嗨，我是你的「拉回正轨」小教练。\n\n失业或空窗期时，日子容易散掉——不是你不行，只是节奏断了。\n\n今天我们只做一件事：找出你想重新靠近的「一个方向」。不用很大，哪怕是「想重新有点精神」「想动起来」都行。\n\n你现在心里，有没有一个隐隐想拉回来的方向？'

  return {
    phase: 'clarifying',
    wish: null,
    recipes: [],
    activeRecipeId: null,
    messages: [
      {
        id: uid('msg'),
        role: 'coach',
        text: opening,
        at: new Date().toISOString(),
      },
    ],
    events: appendEvent([], 'session_started'),
    clarifyingStep: 'awaiting_direction',
    draftWish: '',
    draftDoneLooksLike: '',
  }
}

export function loadState(): SessionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw) as SessionState
    if (!parsed.phase || !Array.isArray(parsed.messages)) {
      return createInitialState()
    }
    return parsed
  } catch {
    return createInitialState()
  }
}

export function saveState(state: SessionState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors in demo
  }
}

export function getActiveRecipe(state: SessionState): Recipe | null {
  if (!state.activeRecipeId) return null
  return state.recipes.find((r) => r.id === state.activeRecipeId) ?? null
}

export function addMessage(
  state: SessionState,
  role: 'coach' | 'user' | 'system',
  text: string,
): SessionState {
  return {
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
    events: appendEvent(state.events, 'message_sent', { role }),
  }
}

/** Max 1 confirmed wish per session */
export function confirmWish(
  state: SessionState,
  text: string,
  doneLooksLike: string,
): SessionState {
  if (state.wish) return state
  if (state.phase !== 'clarifying') return state

  const wish: Wish = {
    text: text.trim(),
    doneLooksLike: doneLooksLike.trim(),
    confirmedAt: new Date().toISOString(),
  }

  let next = addMessage(
    state,
    'coach',
    `好，愿望锁定了：\n「${wish.text}」\n完成时看起来像：${wish.doneLooksLike}\n\n接下来给你一个 ≤2 分钟的小配方——做完就算今天拉回一点点。`,
  )

  next = {
    ...next,
    wish,
    clarifyingStep: 'done',
    draftWish: wish.text,
    draftDoneLooksLike: wish.doneLooksLike,
    events: appendEvent(next.events, 'wish_confirmed', {
      text: wish.text,
      doneLooksLike: wish.doneLooksLike,
    }),
  }

  return issueRecipe(next, {
    anchor: '刷完牙后',
    action: deriveTinyAction(wish.text),
    durationMin: 2,
  })
}

function deriveTinyAction(wishText: string): string {
  const t = wishText.toLowerCase()
  if (/运动|跑|走|健身|身体/.test(t)) return '穿上运动鞋，站在门口深呼吸 3 次'
  if (/写|笔记|日记|记录/.test(t)) return '打开备忘录，写下一句今天的感受'
  if (/学|读|书|英语|技能/.test(t)) return '打开学习材料，只看第一段标题'
  if (/整理|打扫|房间|桌/.test(t)) return '只清理桌面上一小块地方'
  if (/联系|朋友|消息/.test(t)) return '打开聊天框，打出一句问候（先不用发）'
  if (/精神|节奏|日常|正轨|作息/.test(t)) return '走到窗边，站立看外面 60 秒'
  return '找一件衣服叠好，放回原位'
}

export function issueRecipe(
  state: SessionState,
  opts: { anchor: string; action: string; durationMin: number },
): SessionState {
  if (state.wish === null) return state
  if (state.phase === 'ended' || state.phase === 'celebrating') return state
  // Prevent stacking two actives; adjustRecipe clears activeRecipeId first
  if (state.activeRecipeId) return state

  const durationMin = Math.min(2, Math.max(1, Math.round(opts.durationMin)))
  const recipe: Recipe = {
    id: uid('recipe'),
    anchor: opts.anchor,
    action: opts.action,
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
    '做完点下面的「我做成了」就行。太难或卡住了，直接跟我说。',
  ].join('\n')

  let next = addMessage(state, 'coach', coachText)
  next = {
    ...next,
    phase: 'recipe_active',
    recipes: [...next.recipes, recipe],
    activeRecipeId: recipe.id,
    events: appendEvent(next.events, 'recipe_issued', {
      recipeId: recipe.id,
      anchor: recipe.anchor,
      action: recipe.action,
      durationMin: recipe.durationMin,
      difficulty: 1,
    }),
  }
  return next
}

export function completeRecipe(state: SessionState): SessionState {
  const active = getActiveRecipe(state)
  if (!active || state.phase !== 'recipe_active') return state

  const completed: Recipe = {
    ...active,
    status: 'completed',
    completedAt: new Date().toISOString(),
  }

  const recipes = state.recipes.map((r) =>
    r.id === completed.id ? completed : r,
  )

  let next: SessionState = {
    ...state,
    recipes,
    activeRecipeId: null,
    phase: 'celebrating',
    events: appendEvent(state.events, 'recipe_completed', {
      recipeId: completed.id,
    }),
  }

  next = {
    ...next,
    events: appendEvent(next.events, 'celebration_triggered', {
      copy: CELEBRATION_COPY,
    }),
  }

  next = addMessage(next, 'system', CELEBRATION_COPY)
  next = addMessage(
    next,
    'coach',
    `${CELEBRATION_COPY}\n\n这一下已经够了。你也可以关掉页面；如果还想再来，刷新后会记住这次会话。\n若要结束，回我「先不做」即可。`,
  )

  return next
}

export function adjustRecipe(
  state: SessionState,
  reason: string,
): SessionState {
  const active = getActiveRecipe(state)
  if (!active) {
    return addMessage(
      state,
      'coach',
      '当前没有进行中的配方。如果想重新开始，可以刷新页面开新会话。',
    )
  }
  if (state.phase !== 'recipe_active') return state

  const superseded: Recipe = {
    ...active,
    status: 'superseded',
    supersededAt: new Date().toISOString(),
  }

  const smaller = pickSmallerRecipe(active)

  let next: SessionState = {
    ...state,
    recipes: state.recipes.map((r) => (r.id === active.id ? superseded : r)),
    activeRecipeId: null,
    events: appendEvent(state.events, 'recipe_superseded', {
      recipeId: active.id,
      reason,
    }),
  }

  next = addMessage(
    next,
    'coach',
    `没关系，我们把配方再缩小一点（原因：${reason}）。旧的已作废。`,
  )

  next = {
    ...next,
    events: appendEvent(next.events, 'recipe_adjusted', { reason }),
  }

  return issueRecipe(next, smaller)
}

function pickSmallerRecipe(
  old: Recipe,
): { anchor: string; action: string; durationMin: number } {
  const options = [
    { anchor: '喝完一口水后', action: '只深呼吸 3 次，感受脚踩在地上', durationMin: 1 },
    { anchor: '坐下后', action: '把手机扣在桌上，闭眼数到 20', durationMin: 1 },
    { anchor: '刷完牙后', action: '只拉开窗帘（或开一盏灯）', durationMin: 1 },
    { anchor: '打开电脑后', action: '只打开一个空白备忘录，写上日期', durationMin: 1 },
  ]
  const idx = Math.abs(old.action.length) % options.length
  const pick = options[idx]
  if (pick.action === old.action) {
    return options[(idx + 1) % options.length]
  }
  return pick
}

export function endSession(state: SessionState): SessionState {
  if (state.phase === 'ended') return state
  let next = addMessage(
    state,
    'coach',
    '好，先到这里。你已经迈出了一步。随时回来，我们继续把日子一点点拉回正轨。加油。',
  )
  next = {
    ...next,
    phase: 'ended',
    activeRecipeId: null,
    events: appendEvent(next.events, 'session_ended'),
  }
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
  return next
}

export function resetSession(): SessionState {
  localStorage.removeItem(STORAGE_KEY)
  return createInitialState()
}
