import { createServer } from 'node:http'
import { handleChat } from './agent/loop.js'
import { _readPromptForSmoke } from './agent/loop.js'

const port = Number(process.env.PORT || 8787)

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type')
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    let promptOk = false
    try {
      promptOk = _readPromptForSmoke().includes('Knowledge Cards')
    } catch {
      promptOk = false
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, mock: true, promptOk }))
    return
  }

  if (req.method === 'POST' && req.url === '/chat') {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    const sessionId = String(body.sessionId || 'default')
    const text = String(body.text || '')
    try {
      const out = await handleChat(sessionId, text)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(out))
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: String(e) }))
    }
    return
  }

  res.writeHead(404)
  res.end('not found')
})

server.listen(port, () => {
  console.log(`wish-agent server mock on :${port}`)
})
