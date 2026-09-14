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
    '嗨，我是你的愿望教练。\n\n先随便许一个愿，可以很模糊；我们慢慢聊清楚，再给你一个小但认真的第一步。\n\n你心里现在有什么想靠近的事吗？不用完整，一句话就好。'

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
    clarifyingStep: 'wishing',
    draftWish: '',
    draftDoneLooksLike: '',
    exploreUserTurns: 0,
    draftBehavior: '',
    draftAnchor: '',
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
    // Migrate older persisted shapes
    const validSteps = new Set(['wishing', 'exploring', 'confirming', 'done'])
    if (!validSteps.has(parsed.clarifyingStep)) {
      return createInitialState()
    }
    return {
      ...createInitialState(),
      ...parsed,
      exploreUserTurns: parsed.exploreUserTurns ?? 0,
      draftBehavior: parsed.draftBehavior ?? '',
      draftAnchor: parsed.draftAnchor ?? '',
    }
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

export type WishDomain =
  | 'movement'
  | 'learning'
  | 'writing'
  | 'tidy'
  | 'social'
  | 'mental'
  | 'venture'
  | 'generic'

/** Map aspiration text to a semantic domain (Fogg: Aspiration ≠ Behavior). */
export function classifyWishDomain(wishText: string): WishDomain {
  const t = wishText.toLowerCase()
  // Side hustle / business / income first — before social「家人」false positives
  if (
    /副业|生意|创业|客户|成交|变现|赚钱|收入|生意|店铺|电商|接单|自由职业|独立|产品|服务|报价|方案|内容账号|自媒体|咨询/.test(
      t,
    )
  ) {
    return 'venture'
  }
  if (/运动|跑|走|健身|身体|锻炼|散步|瑜伽|拉伸|出汗|动起来|动一动|活动一下|起来动/.test(t)) return 'movement'
  if (/学|读|书|英语|技能|课程|复习|知识|听课/.test(t)) return 'learning'
  if (/写|笔记|日记|记录|写作|备忘/.test(t)) return 'writing'
  if (/整理|打扫|房间|桌|收纳|衣服|衣柜|叠|清洁|乱/.test(t))
    return 'tidy'
  if (/联系|朋友|消息|社交|聊天/.test(t)) return 'social'
  if (/精神|节奏|日常|正轨|作息|能量|精力|状态|起床|早起|焦虑|放松|平静|习惯/.test(t))
    return 'mental'
  return 'generic'
}

/** True if action looks like a meaningless filler (must never ship for real wishes). */
export function isFillerAction(action: string): boolean {
  return /喝一小口|倒一杯水|感受一下自己还在这里|叠一件衣服/.test(action)
}

/**
 * Grow a tiny Behavior footprint from wish semantics.
 * NEVER default to「叠一件衣服」unless the wish is about decluttering/clothes.
 */
export function deriveTinyAction(wishText: string): string {
  switch (classifyWishDomain(wishText)) {
    case 'venture':
      return '打开备忘录，用一行字写下「副业下一步：______」（先填一个具体动作名）'
    case 'movement':
      return '穿上鞋，在原地站立并深呼吸 3 次'
    case 'learning':
      return '打开学习材料，只看第一段标题'
    case 'writing':
      return '打开备忘录，写下一句今天的感受'
    case 'tidy':
      return '只清理桌面上一小块地方'
    case 'social':
      return '打开聊天框，打出一句问候（先不用发）'
    case 'mental':
      return '走到窗边，站立看外面 60 秒'
    case 'generic':
    default:
      // Never ship ritual filler — always echo the aspiration as a named next step
      return '打开备忘录，用一行字写下「为这个愿望，我今天最小的一步是：______」'
  }
}

export function deriveDefaultAnchor(wishText: string): string {
  switch (classifyWishDomain(wishText)) {
    case 'venture':
      return '打开电脑后'
    case 'movement':
      return '起床后'
    case 'learning':
      return '打开电脑后'
    case 'writing':
      return '坐下后'
    case 'tidy':
      return '进房间后'
    case 'social':
      return '刷完手机后'
    case 'mental':
      return '刷完牙后'
    default:
      return '坐下后'
  }
}

export function deriveDoneLooksLike(wishText: string): string {
  switch (classifyWishDomain(wishText)) {
    case 'venture':
      return '备忘录里已经写下副业的下一个具体动作名'
    case 'movement':
      return '你已经穿好鞋或站起来准备动了'
    case 'learning':
      return '学习材料已经打开在眼前'
    case 'writing':
      return '备忘录里多了一句话'
    case 'tidy':
      return '眼前有一小块地方变干净了'
    case 'social':
      return '问候已经打在输入框里'
    case 'mental':
      return '你完成了一个微小的日常动作，朝那个状态靠近了一步'
    default:
      return '你已经写下朝这个愿望迈出的最小一步'
  }
}

/** Offer 2–3 wish-related micro-steps when user is stuck (Fogg swarm, tiny). */
export function suggestBehaviorOptions(wishText: string): string[] {
  switch (classifyWishDomain(wishText)) {
    case 'venture':
      return [
        '打开备忘录，写下一句：我的副业想帮谁解决什么问题',
        '打开备忘录，列出一个我已经会的、可能能卖的技能',
        '打开聊天框，起草一条询问「你愿不愿听听我在做的事」（先不发送）',
      ]
    case 'movement':
      return [
        '穿上鞋，在原地站立并深呼吸 3 次',
        '走到门口，做 10 次原地踏步',
      ]
    case 'learning':
      return [
        '打开学习材料，只看第一段标题',
        '打开备忘录，写下今天只学的一个小点',
      ]
    default:
      return [
        '打开备忘录，用一行字写下「为这个愿望，我今天最小的一步是：______」',
        '打开备忘录，写下这件事对你重要的一个原因',
      ]
  }
}

/** Max 1 confirmed wish per session */
export function confirmWish(
  state: SessionState,
  text: string,
  doneLooksLike: string,
  recipeOpts?: { anchor?: string; action?: string; durationMin?: number },
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
    `好，愿望锁定了：\n「${wish.text}」\n完成时看起来像：${wish.doneLooksLike}\n\n接下来给你一个小但认真的第一步——≤2 分钟，做完就算今天朝它靠近了一点。`,
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

  const action =
    (recipeOpts?.action || state.draftBehavior || '').trim() ||
    deriveTinyAction(wish.text)
  const anchor =
    (recipeOpts?.anchor || state.draftAnchor || '').trim() ||
    deriveDefaultAnchor(wish.text)

  return issueRecipe(next, {
    anchor,
    action,
    durationMin: recipeOpts?.durationMin ?? 2,
  })
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
    '这是小但认真的第一步。做完点下面的「我做成了」就行。太难或卡住了，直接跟我说。',
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

  const wishText = state.wish?.text ?? state.draftWish ?? ''
  const smaller = pickSmallerRecipe(active, wishText)

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
    `没关系，我们把配方再缩小一点（原因：${reason}）。旧的已作废——仍然朝着同一个愿望。`,
  )

  next = {
    ...next,
    events: appendEvent(next.events, 'recipe_adjusted', { reason }),
  }

  return issueRecipe(next, smaller)
}

/**
 * Shrink to a still wish-related tiny action (adult tone, not childish / unrelated).
 */
export function pickSmallerRecipe(
  old: Recipe,
  wishText: string,
): { anchor: string; action: string; durationMin: number } {
  const domain = classifyWishDomain(wishText || old.action)
  const byDomain: Record<
    WishDomain,
    Array<{ anchor: string; action: string; durationMin: number }>
  > = {
    movement: [
      { anchor: '起床后', action: '只穿上一只鞋，站稳 10 秒', durationMin: 1 },
      { anchor: '站起来后', action: '原地活动脚踝 5 下', durationMin: 1 },
      { anchor: '刷完牙后', action: '走到门口，来回走 4 步', durationMin: 1 },
      { anchor: '坐下久了之后', action: '站起来伸展双臂，停 5 秒', durationMin: 1 },
    ],
    learning: [
      { anchor: '打开电脑后', action: '只打开学习材料的封面或目录页', durationMin: 1 },
      { anchor: '坐下后', action: '把学习材料放到眼前，看一眼标题', durationMin: 1 },
    ],
    writing: [
      { anchor: '坐下后', action: '打开备忘录，只写下今天的日期', durationMin: 1 },
      { anchor: '拿起手机后', action: '打开备忘录，光标闪一下就够', durationMin: 1 },
    ],
    tidy: [
      { anchor: '进房间后', action: '只把一件东西放回原位', durationMin: 1 },
      { anchor: '看到桌面后', action: '只挪开眼前一个物品', durationMin: 1 },
    ],
    social: [
      { anchor: '刷完手机后', action: '打开聊天列表，停留 5 秒即可', durationMin: 1 },
      { anchor: '坐下后', action: '想好一句问候，先不用发出去', durationMin: 1 },
    ],
    mental: [
      { anchor: '刷完牙后', action: '走到窗边，看外面 20 秒', durationMin: 1 },
      { anchor: '坐下后', action: '站立感受脚踩在地上，数到 10', durationMin: 1 },
    ],
    venture: [
      { anchor: '打开电脑后', action: '打开备忘录，只写下副业想帮谁', durationMin: 1 },
      { anchor: '坐下后', action: '打开备忘录，列出一个可能能卖的技能名', durationMin: 1 },
    ],
    generic: [
      { anchor: '坐下后', action: '打开备忘录，写下「今天最小的一步是：______」', durationMin: 1 },
      { anchor: '打开手机后', action: '打开备忘录，写下这个愿望对你重要的一个原因', durationMin: 1 },
    ],
  }

  const options = byDomain[domain]
  const idx = Math.abs(old.action.length) % options.length
  let pick = options[idx]
  if (pick.action === old.action) {
    pick = options[(idx + 1) % options.length]
  }
  return pick
}

export function endSession(state: SessionState): SessionState {
  if (state.phase === 'ended') return state
  let next = addMessage(
    state,
    'coach',
    '好，先到这里。你已经迈出了一步。随时回来，我们继续把日子一点点拉回正轨。',
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
