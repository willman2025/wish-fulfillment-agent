# 拉回正轨 · 愿望教练（MVP）

失业 / 空窗期后的温柔教练：澄清 **一个** 愿望 → 领取 **一个** ≤2 分钟小配方 → 做成 → 庆祝。可在会话内把配方调小。

## 快速开始

```bash
cd wish-fulfillment-agent
npm install
npm run dev
```

浏览器打开终端提示的本地地址（通常是 `http://localhost:5173`）。

生产构建：

```bash
npm run build
npm run preview
```

## 产品闭环

1. **澄清对话** → `confirmWish(text, done_looks_like)`（每会话最多 1 个愿望）
2. **发放配方** → `issueRecipe(anchor, action, duration_min≤2, difficulty=1)`（最多 1 个进行中配方）
3. **完成** → `completeRecipe` → 庆祝文案 + 事件 `recipe_completed` / `celebration_triggered`
4. **调整** → 用户说太难 / 没做成 / 卡住 / 想换 → `adjustRecipe`（旧配方 superseded，新配方 active）

会话阶段：`clarifying` | `recipe_active` | `celebrating` | `ended`  
状态持久化：`localStorage`（键名 `wish-fulfillment-agent:v1`）

**精确庆祝文案（不可改）：** `今天，你把这件小事做成了。`

## 60 秒 Happy Path 演示脚本

1. 打开页面，看到开场白（问空窗 / 节奏散了 + 想拉回的方向）。
2. 输入：`想重新有点精神`
3. 教练给出具体愿望 +「完成时看起来像」，输入：`确认`
4. 出现【今日小配方】卡片（锚点如「刷完牙后」+ 动作 + ≤2 分钟）。
5. 点击 **「我做成了」**（或输入「做成了」）。
6. 看到大庆祝层与精确文案：**今天，你把这件小事做成了。**
7. （可选）打开开发者工具 → Application → Local Storage，确认有会话 JSON；事件列表含 `wish_confirmed`、`recipe_issued`、`recipe_completed`、`celebration_triggered`。

## 调整配方演示脚本

1. 新会话（点右上角「新会话」），走完澄清并 `确认`，进入配方阶段。
2. **不要**点完成，在输入框发：`太难了`（或 `没做成` / `卡住了` / `想换一个`）。
3. 教练作废旧配方，发放更小的新配方；卡片内容更新。
4. 再点「我做成了」完成庆祝闭环。
5. 若输入 `先不做`，会话礼貌结束（phase = `ended`）。

## 刻意不做

推送 / 提醒、支付、多愿望、课程、社交、连续打卡、求职投递、医疗建议。

## 技术栈

Vite + React + TypeScript。聊天式单页 UI，非表单向导。

| 路径 | 说明 |
|------|------|
| `src/types.ts` | 类型、庆祝文案常量 |
| `src/state/session.ts` | 状态机与闭环 API |
| `src/state/events.ts` | 事件日志 |
| `src/coach/dialogue.ts` | 教练对话与意图识别 |
| `src/App.tsx` | UI |
