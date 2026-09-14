import type { SessionState } from '../state/session.js'

const FILLER = /喝一小口|倒一杯水|感受一下自己还在这里|深呼吸凑数/

export function isFillerAction(action: string): boolean {
  return FILLER.test(action)
}

export function assertConfirmWish(s: SessionState, wantToDo: boolean): string | null {
  if (s.phase !== 'clarifying') return '不在澄清阶段'
  if (s.exploreUserTurns < 2) return '探索轮次不足'
  if (!wantToDo) return '用户尚未明示想去做'
  if (s.wish) return '已有确认愿望'
  if (!s.draftWish.trim()) return '尚无愿望草稿'
  return null
}

export function assertIssueRecipe(
  s: SessionState,
  action: string,
  durationMin: number,
): string | null {
  if (!s.wish) return '尚未确认愿望'
  if (s.activeRecipe) return '已有进行中配方'
  if (s.phase === 'celebrating' || s.phase === 'ended') return '阶段不允许出方'
  if (durationMin > 2) return '时长须≤2分钟'
  if (isFillerAction(action)) return 'filler动作非法'
  if (!action.trim()) return '动作为空'
  return null
}

export function containsBlackHat(text: string): boolean {
  return /WIG|4DX|原则库|领先指标|Fogg|Tiny Habits/.test(text)
}
