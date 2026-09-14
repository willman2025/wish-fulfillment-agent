import { handleChat } from '../agent/loop.js'
import { createSession, saveSession, CELEBRATION_COPY } from '../state/session.js'

async function run() {
  const id = `smoke_${Date.now()}`
  saveSession(id, createSession())

  const r1 = await handleChat(id, '我想发展我的副业')
  const r2 = await handleChat(id, '希望靠副业养活家人，有自己的事业')
  // must NOT contain full recipe steps before want-to-do
  const premature = /【今日小配方】|锚点：/.test(r2.utterance + JSON.stringify(r2.messages))
  if (premature) throw new Error('FAIL: recipe before want-to-do')

  const r3 = await handleChat(id, '想去做')
  if (!r3.state.activeRecipe) throw new Error('FAIL: no recipe after want-to-do')
  if (/喝水|喝一小口/.test(r3.state.activeRecipe.action)) {
    throw new Error('FAIL: filler recipe for side hustle')
  }

  const r4 = await handleChat(id, '我做成了')
  const celebrated = r4.messages.some((m) => m.text.includes(CELEBRATION_COPY))
  if (!celebrated) throw new Error('FAIL: celebration copy')

  console.log('gateFive smoke PASS')
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
