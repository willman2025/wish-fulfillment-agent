import { FormEvent, useEffect, useRef, useState } from 'react'
import { CELEBRATION_COPY, type SessionState } from './types'
import { handleUserMessage } from './coach/dialogue'
import {
  completeRecipe,
  getActiveRecipe,
  loadState,
  resetSession,
  saveState,
} from './state/session'
import './App.css'

const PHASE_LABEL: Record<SessionState['phase'], string> = {
  clarifying: '澄清愿望',
  recipe_active: '配方进行中',
  celebrating: '庆祝',
  ended: '已结束',
}

export default function App() {
  const [state, setState] = useState<SessionState>(() => loadState())
  const [input, setInput] = useState('')
  const [showCelebration, setShowCelebration] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevPhase = useRef(state.phase)

  useEffect(() => {
    saveState(state)
  }, [state])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.messages])

  useEffect(() => {
    if (state.phase === 'celebrating' && prevPhase.current !== 'celebrating') {
      setShowCelebration(true)
    }
    prevPhase.current = state.phase
  }, [state.phase])

  function commit(next: SessionState) {
    setState(next)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || state.phase === 'ended') return
    setInput('')
    commit(handleUserMessage(state, text))
  }

  function onComplete() {
    commit(completeRecipe(state))
  }

  function onNewSession() {
    setShowCelebration(false)
    commit(resetSession())
  }

  const active = getActiveRecipe(state)
  const inputDisabled = state.phase === 'ended'

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo" aria-hidden>
            ◎
          </span>
          <div>
            <h1>拉回正轨</h1>
            <p className="tagline">一次一个愿望 · 两分钟小配方</p>
          </div>
        </div>
        <div className="header-actions">
          <span className={`phase-pill phase-${state.phase}`}>
            {PHASE_LABEL[state.phase]}
          </span>
          <button type="button" className="btn ghost" onClick={onNewSession}>
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

        <ul className="messages" aria-live="polite">
          {state.messages.map((m) => (
            <li key={m.id} className={`bubble bubble-${m.role}`}>
              {m.role === 'coach' && <span className="who">教练</span>}
              {m.role === 'user' && <span className="who">你</span>}
              {m.role === 'system' && <span className="who">庆祝</span>}
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
          <button type="button" className="btn primary complete-btn" onClick={onComplete}>
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
              ? '会话已结束，请开新会话'
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
