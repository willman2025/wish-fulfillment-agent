# M1 Agent Loop 骨架

对齐架构 v1.1 / v1.1.1。

1. Perceive：组装 session + 用户消息（探索轮次计数）
2. Reason：LLM 产出 `utterance?` + `tool_calls[]`
3. Act：Harness 校验 Tool → 改 SessionState 或 reject
4. Observe：reject 后最多 1 次额外 Reason
5. 返回：人话 + 状态快照

合入仓库：把 `server/` 放进 `willman2025/wish-fulfillment-agent`，前端改打 `/api/turn`。
