import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

export function loadSystemPrompt(): string {
  return readFileSync(join(root, 'prompts/system-v1.1.1.md'), 'utf8')
}
