/**
 * OpenAI-compatible chat client. Credentials from env only.
 * LLM_API_KEY / LLM_BASE_URL / LLM_MODEL
 */

export type LlmToolCall = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type LlmReasonResult = {
  utterance?: string
  tool_calls: LlmToolCall[]
  rawContent?: string
}

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
}

export type LlmToolDef = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

function env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim()
}

export function getLlmConfig() {
  return {
    apiKey: env('LLM_API_KEY'),
    baseUrl: env('LLM_BASE_URL', 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: env('LLM_MODEL', 'gpt-4o-mini'),
  }
}

export function isLlmConfigured(): boolean {
  return Boolean(getLlmConfig().apiKey)
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}')
    return typeof v === 'object' && v && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** Fallback: parse utterance + tool_calls from a JSON blob in content. */
function parseContentFallback(content: string): LlmReasonResult {
  const trimmed = content.trim()
  // Try fenced JSON
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fence?.[1]?.trim() ?? trimmed
  try {
    const obj = JSON.parse(candidate) as {
      utterance?: string
      tool_calls?: Array<{ name?: string; arguments?: Record<string, unknown>; id?: string }>
    }
    const tool_calls: LlmToolCall[] = (obj.tool_calls ?? [])
      .filter((t) => t && typeof t.name === 'string')
      .map((t, i) => ({
        id: t.id ?? `parsed_${i}`,
        name: t.name as string,
        arguments: t.arguments ?? {},
      }))
    return {
      utterance: typeof obj.utterance === 'string' ? obj.utterance : undefined,
      tool_calls,
      rawContent: content,
    }
  } catch {
    // Plain speech only
    return { utterance: trimmed || undefined, tool_calls: [], rawContent: content }
  }
}

export async function reasonWithLlm(opts: {
  system: string
  messages: LlmMessage[]
  tools: LlmToolDef[]
}): Promise<LlmReasonResult> {
  const { apiKey, baseUrl, model } = getLlmConfig()
  if (!apiKey) {
    throw new Error('LLM_API_KEY is not set')
  }

  const body = {
    model,
    messages: [
      { role: 'system', content: opts.system },
      ...opts.messages.map((m) => {
        if (m.role === 'tool') {
          return {
            role: 'tool' as const,
            content: m.content,
            tool_call_id: m.tool_call_id ?? 'unknown',
            name: m.name,
          }
        }
        return { role: m.role, content: m.content }
      }),
    ],
    tools: opts.tools,
    tool_choice: 'auto' as const,
    temperature: 0.4,
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 400)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: Array<{
          id: string
          function?: { name?: string; arguments?: string }
        }>
      }
    }>
  }

  const msg = data.choices?.[0]?.message
  if (!msg) {
    return { tool_calls: [] }
  }

  const nativeCalls = msg.tool_calls ?? []
  if (nativeCalls.length > 0) {
    return {
      utterance: msg.content?.trim() || undefined,
      tool_calls: nativeCalls.map((c, i) => ({
        id: c.id || `tc_${i}`,
        name: c.function?.name ?? 'unknown',
        arguments: parseArgs(c.function?.arguments ?? '{}'),
      })),
      rawContent: msg.content ?? undefined,
    }
  }

  if (msg.content) {
    return parseContentFallback(msg.content)
  }

  return { tool_calls: [] }
}

/** Test helper: deterministic reasoner for evals (no network). */
export type MockReasonFn = (
  round: number,
  observe?: Array<{ tool: string; ok: boolean; reason?: string }>,
) => LlmReasonResult
