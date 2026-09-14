import express from 'express'
import cors from 'cors'
import { createLlm } from './llm'
import { runTurn } from './orchestrator'

const app = express()
app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'wish-agent-server', loop: 'Perceive-Reason-Act-Observe' })
})

async function handleTurn(req: any, res: any) {
  try {
    const body = req.body as { sessionId?: string; message?: string; text?: string }
    const sessionId = body.sessionId
    const message = body.message || body.text
    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'message or text required' })
      return
    }
    const llm = createLlm()
    const result = await runTurn(llm, { sessionId, message })
    res.json({
      sessionId: result.sessionId,
      utterance: result.utterance,
      rejected: result.rejected,
      state: {
        phase: result.state.phase,
        clarifyingStep: result.state.clarifyingStep,
        wish: result.state.wish,
        recipes: result.state.recipes,
        activeRecipeId: result.state.activeRecipeId,
        wantToDo: result.state.wantToDo,
        exploreUserTurns: result.state.exploreUserTurns,
        draftWish: result.state.draftWish,
        events: result.state.events.slice(-8),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    res.status(500).json({ error: msg })
  }
}

app.post('/api/turn', handleTurn)
app.post('/api/chat', handleTurn)
app.post('/chat', handleTurn)

const PORT = Number(process.env.PORT ?? 3001)
app.listen(PORT, () => {
  console.log(`wish-agent-server listening on :${PORT} (mock LLM unless LLM_API_KEY set)`)
})
