import fs from 'node:fs'
import path from 'node:path'

export type Logger = (msg: string) => void

export function fileLogger(file: string): Logger {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  return (msg) => {
    try {
      fs.appendFileSync(file, `${new Date().toISOString()} ${msg}\n`)
    } catch {}
  }
}
