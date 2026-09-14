import { CELEBRATION_COPY } from '../src/types'
import { createSession, resetStore } from '../src/store'
import { executeTool } from '../src/tools'
import { MockLlm } from '../src/llm'
import { runTurn } from '../src/orchestrator'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error('FAIL: ' + msg)
}

async function happyPath() {
  resetStore()
  const llm = new MockLlm()
  let sid: string | undefined

  let r = await runTurn(llm, { message: '想搞副业有点收入' })
  sid = r.sessionId
  assert(r.state.clarifyingStep === 'exploring', 'after wish -> exploring')
  assert(r.state.exploreUserTurns === 0, 'first wish not counted as explore')

  r = await runTurn(llm, { sessionId: sid, message: '最卡的是不知道从哪开始' })
  assert(r.state.exploreUserTurns === 1, 'explore=1')

  r = await runTurn(llm, { sessionId: sid, message: '晚上坐下后大概能做一点点' })
  assert(r.state.exploreUserTurns === 2, 'explore=2')
  assert(!/锚点：/.test(r.utterance), 'no recipe leak before want-to-do')

  r = await runTurn(llm, { sessionId: sid, message: '想去做' })
  assert(r.state.wish, 'wish confirmed')
  assert(r.state.wantToDo, 'wantToDo')
  assert(r.state.phase === 'recipe_active', 'recipe_active')
  assert(r.state.activeRecipeId, 'has active recipe')
  assert(!/喝一小口|叠一件衣服/.test(JSON.stringify(r.state.recipes)), 'no filler')

  r = await runTurn(llm, { sessionId: sid, message: '做成了' })
  assert(r.state.phase === 'celebrating', 'celebrating')
  const cele = r.state.messages.some((m) => m.text.includes(CELEBRATION_COPY))
  assert(cele, 'exact celebration copy')
  console.log('PASS happy path + celebration')
}

function gateReject() {
  resetStore()
  let state = createSession()
  state = {
    ...state,
    clarifyingStep: 'exploring',
    draftWish: '想搞副业',
    exploreUserTurns: 1,
  }
  const { result } = executeTool(state, {
    name: 'confirm_wish',
    args: { text: '想搞副业' },
  })
  assert(!result.ok && result.reason === 'explore_lt_2', 'confirm blocked explore<2')

  state = { ...state, exploreUserTurns: 2, wantToDo: false, wish: null }
  const issue = executeTool(state, {
    name: 'issue_recipe',
    args: { action: '打开备忘录写一行', anchor: '坐下后' },
  })
  assert(!issue.result.ok && issue.result.reason === 'no_wish', 'issue blocked without wish')

  const early = executeTool(
    { ...state, wish: { text: '想搞副业', doneLooksLike: 'x', confirmedAt: new Date().toISOString() }, wantToDo: false },
    { name: 'issue_recipe', args: { action: '打开备忘录写一行', anchor: '坐下后' } },
  )
  assert(!early.result.ok && early.result.reason === 'not_want_to_do', 'issue blocked without wantToDo')

  const filler = executeTool(
    {
      ...state,
      wish: { text: '想搞副业赚钱', doneLooksLike: 'x', confirmedAt: new Date().toISOString() },
      wantToDo: true,
      exploreUserTurns: 2,
    },
    { name: 'issue_recipe', args: { action: '倒一杯水喝一小口', anchor: '坐下后' } },
  )
  assert(!filler.result.ok && filler.result.reason === 'filler_banned', 'venture filler banned')
  console.log('PASS gate rejects (explore<2 / not_want_to_do / filler)')
}

async function main() {
  await happyPath()
  gateReject()
  console.log('ALL PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
