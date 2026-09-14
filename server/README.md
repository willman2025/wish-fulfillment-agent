# wish-agent-server (M1)

服务端 Agent Loop：Perceive → Reason → Act → Observe。

- 大脑：`MockLlm`（默认）或后续 `LLM_API_KEY` 真模型
- 状态只经 Tools 改变；门闩在 Harness（`tools.ts`）
- API：`POST /api/turn` `{ sessionId?, message }` → `{ utterance, state, rejected? }`

## Run

```bash
cd server
npm install
npm run demo   # 评测 happy path + 门闩
npm run dev    # :3001
```

## 禁止

前端裸调模型 / 两处 JSON 补丁当大脑。UI 只打 `/api/turn` 吃快照。
