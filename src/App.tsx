import { FormEvent, useEffect, useRef, useState } from 'react'
import { CELEBRATION_COPY, type ChatMessage, type SessionState } from './types'
import { postReset, postTurn } from './api/agent'
import { getActiveRecipe } from './state/session'
import './App.css'

const PHASE_LABEL: Record<SessionState['phase'], string> = {
  clarifying: '澄清愿望',
  recipe_active: '配方进行中',
  celebrating: '庆祝',
  ended: '已结束',
}

const SESSION_KEY = 'wish-fulfillment-agent:sessionId'
const WELCOME =
  '嗨，我是你的愿望教练。先随便许一个愿，可以很模糊；我们慢慢聊清楚，再给你一个小但认真的第一步。你心里现在有什么想靠近的事吗？不用完整，一句话就好。'

function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function msg(role: ChatMessage['role'], text: string): ChatMessage {
  return { id: uid('msg'), role, text, at: new Date().toISOString() }
}

function emptyUiState(): SessionState {
  return {
    phase: 'clarifying',
    wish: null,
    recipes: [],
    activeRecipeId: null,
    messages: [msg('coach', WELCOME)],
    events: [],
    clarifyingStep: 'wishing',
    draftWish: '',
    draftDoneLooksLike: '',
    exploreUserTurns: 0,
    draftBehavior: '',
    draftAnchor: '',
  }
}

function mergeServerState(
  prev: SessionState,
  server: Partial<SessionState> & { wantToDo?: boolean },
  extraMessages: ChatMessage[],
): SessionState {
  return {
    ...prev,
    phase: server.phase ?? prev.phase,
    wish: server.wish ?? prev.wish,
    recipes: server.recipes ?? prev.recipes,
    activeRecipeId:
      server.activeRecipeId !== undefined ? server.activeRecipeId : prev.activeRecipeId,
    clarifyingStep: server.clarifyingStep ?? prev.clarifyingStep,
    draftWish: server.draftWish ?? prev.draftWish,
    draftDoneLooksLike: server.draftDoneLooksLike ?? prev.draftDoneLooksLike,
    exploreUserTurns: server.exploreUserTurns ?? prev.exploreUserTurns,
    draftBehavior: server.draftBehavior ?? prev.draftBehavior,
    draftAnchor: server.draftAnchor ?? prev.draftAnchor,
    events: server.events ?? prev.events,
    messages: [...prev.messages, ...extraMessages],
  }
}

export default function App() {
  const [state, setState] = useState<SessionState>(() => emptyUiState())
  const [sessionId, setSessionId] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem(SESSION_KEY) || undefined
    } catch {
      return undefined
    }
  })
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCelebration, setShowCelebration] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevPhase = useRef(state.phase)

  useEffect(() => {
    if (sessionId) localStorage.setItem(SESSION_KEY, sessionId)
    else localStorage.removeItem(SESSION_KEY)
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.messages])

  useEffect(() => {
    if (state.phase === 'celebrating' && prevPhase.current !== 'celebrating') {
      setShowCelebration(true)
    }
    prevPhase.current = state.phase
  }, [state.phase])

  async function sendTurn(text: string, optimisticUser = true) {
    if (busy || state.phase === 'ended') return
    setBusy(true)
    setError(null)
    const extras: ChatMessage[] = optimisticUser ? [msg('user', text)] : []
    if (optimisticUser) {
      setState((s) => ({ ...s, messages: [...s.messages, extras[0]] }))
    }
    try {
      const res = await postTurn({ sessionId, message: text })
      setSessionId(res.sessionId)
      const coach = msg('coach', res.utterance)
      setState((s) =>
        mergeServerState(
          optimisticUser ? s : { ...s, messages: [...s.messages, ...extras] },
          res.state as Partial<SessionState>,
          optimisticUser ? [coach] : [...extras, coach],
        ),
      )
    } catch (e) {
      const hint = e instanceof Error ? e.message : String(e)
      setError(hint)
      setState((s) => ({
        ...s,
        messages: [
          ...s.messages,
          msg('system', `连不上 Agent 服务：${hint}`),
        ],
      }))
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || state.phase === 'ended' || busy) return
    setInput('')
    void sendTurn(text)
  }

  function onComplete() {
    void sendTurn('我做成了')
  }

  async function onNewSession() {
    setShowCelebration(false)
    setError(null)
    setBusy(true)
    try {
      const res = await postReset(sessionId)
      setSessionId(res.sessionId)
      const next = emptyUiState()
      if (res.utterance) {
        next.messages = [msg('coach', res.utterance)]
      }
      setState(mergeServerState(next, res.state as Partial<SessionState>, []))
    } catch {
      setSessionId(undefined)
      setState(emptyUiState())
    } finally {
      setBusy(false)
    }
  }

  const active = getActiveRecipe(state)
  const inputDisabled = state.phase === 'ended' || busy

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◎
          </span>
          <div>
            <h1>拉回正轨</h1>
            <p className="tagline">一次一个愿望 · 两分钟小配方 · Agent API</p>
          </div>
        </div>
        <div className="header-actions">
          <span className={`phase-pill phase-${state.phase}`}>
            {PHASE_LABEL[state.phase]}
          </span>
          <button type="button" className="btn ghost" onClick={() => void onNewSession()}>
            新会话
          </button>
        </div>
      </header>

      <main className="chat">
        {state.wish && (
          <div className="wish-banner">
            <span className="wish-label">当前愿望</span>
            <span className="wish-text">{state.wish.text}</span>
          </div>
        )}
        {error && <div className="wish-banner" style={{ borderColor: '#c44' }}>{error}</div>}

        <ul className="messages" aria-live="polite">
          {state.messages.map((m) => (
            <li key={m.id} className={`bubble bubble-${m.role}`}>
              {m.role === 'coach' && <span className="who">教练</span>}
              {m.role === 'user' && <span className="who">你</span>}
              {m.role === 'system' && <span className="who">系统</span>}
              <pre className="bubble-text">{m.text}</pre>
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </main>

      {active && state.phase === 'recipe_active' && (
        <section className="recipe-card">
          <h2>今日小配方</h2>
          <dl>
            <div>
              <dt>锚点</dt>
              <dd>{active.anchor}</dd>
            </div>
            <div>
              <dt>动作</dt>
              <dd>{active.action}</dd>
            </div>
            <div>
              <dt>时长</dt>
              <dd>≤ {active.durationMin} 分钟 · 难度 {active.difficulty}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn primary complete-btn"
            onClick={onComplete}
            disabled={busy}
          >
            我做成了
          </button>
        </section>
      )}

      <form className="composer" onSubmit={onSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            inputDisabled
              ? busy
                ? '教练在想…'
                : '会话已结束，请开新会话'
              : state.phase === 'recipe_active'
                ? '说说进度，或「太难」「想换」…'
                : '跟教练说说…'
          }
          disabled={inputDisabled}
          autoComplete="off"
          aria-label="消息输入"
        />
        <button
          type="submit"
          className="btn primary"
          disabled={inputDisabled || !input.trim()}
        >
          发送
        </button>
      </form>

      {showCelebration && state.phase === 'celebrating' && (
        <div
          className="celebration-overlay"
          role="dialog"
          aria-label="庆祝"
          onClick={() => setShowCelebration(false)}
        >
          <div className="celebration-card" onClick={(e) => e.stopPropagation()}>
            <div className="confetti" aria-hidden>
              ✦ ✧ ★ ✦
            </div>
            <p className="celebration-copy">{CELEBRATION_COPY}</p>
            <button
              type="button"
              className="btn primary"
              onClick={() => setShowCelebration(false)}
            >
              收下这份感觉
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
