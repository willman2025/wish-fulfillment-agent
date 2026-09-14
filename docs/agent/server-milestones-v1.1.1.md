# 服务端 Agent 目录与里程碑（v1.1.1）

## 推荐目录
```
server/
  src/
    agent/
      loop.ts              # Perceive→Reason→Act→Observe orchestrator
      prompt.ts            # System Prompt v1.1.1 loader
      context.ts           # Context bundle builder
    harness/
      llm.ts               # OpenAI-compatible client (env keys)
      toolRouter.ts        # parse tool_calls → execute
      tracing.ts
    tools/
      utter.ts
      setDraft.ts
      confirmWish.ts
      issueRecipe.ts
      completeRecipe.ts
      adjustRecipe.ts
      endSession.ts
      guards.ts            # 门闩 + Fogg/filler + 黑话扫描
    state/
      session.ts           # SessionState 权威源
      events.ts
    eval/
      gateFive.ts          # 合入五条门闩
      theoryRubric.ts      # T1–T9 / 知识卡应用
    index.ts               # HTTP: POST /chat
  prompts/
    system-v1.1.1.md
  .env.example             # LLM_API_KEY LLM_BASE_URL LLM_MODEL
web/                       # 现有 Vite 前端：只打 /chat，不裸调模型
```

## 里程碑
M0（今日–24h）：harness + tools 骨架 + mock LLM（固定剧本走通环路）+ 门禁五条自动化冒烟
M1：真模型接入；加载 system-v1.1.1.md（含三卡）；reject 后人话改口
M2：评测五条 + 理论可感 T1–T9 合入门禁；副业路径 PASS
M3：前端切到服务端 Agent；停脚本主路径扩写；庆祝常量仍运行时注入

## 环境
LLM_API_KEY / LLM_BASE_URL / LLM_MODEL 仅服务端；不上仓库、不上浏览器。
