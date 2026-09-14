export type WishDomain =
  | 'movement'
  | 'learning'
  | 'writing'
  | 'tidy'
  | 'social'
  | 'mental'
  | 'venture'
  | 'generic'

export function classifyWishDomain(wishText: string): WishDomain {
  const t = wishText.toLowerCase()
  if (
    /副业|生意|创业|客户|成交|变现|赚钱|收入|店铺|电商|接单|自由职业|独立|产品|服务|报价|方案|内容账号|自媒体|咨询/.test(
      t,
    )
  ) {
    return 'venture'
  }
  if (/运动|跑|走|健身|身体|锻炼|散步|瑜伽|拉伸|出汗|动起来|动一动|活动一下|起来动/.test(t))
    return 'movement'
  if (/学|读|书|英语|技能|课程|复习|知识|听课/.test(t)) return 'learning'
  if (/写|笔记|日记|记录|写作|备忘/.test(t)) return 'writing'
  if (/整理|打扫|房间|桌|收纳|衣服|衣柜|叠|清洁|乱/.test(t)) return 'tidy'
  if (/联系|朋友|消息|社交|聊天/.test(t)) return 'social'
  if (/精神|节奏|日常|正轨|作息|能量|精力|状态|起床|早起|焦虑|放松|平静|习惯/.test(t))
    return 'mental'
  return 'generic'
}

export function isFillerAction(action: string): boolean {
  return /喝一小口|倒一杯水|感受一下自己还在这里|叠一件衣服/.test(action)
}

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
    default:
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
