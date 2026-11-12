import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
const python = existsSync('.venv/bin/python') ? '.venv/bin/python' : 'python3'
const children = [
  spawn(
    python,
    ['-m', 'uvicorn', 'backend.app.main:app', '--host', '0.0.0.0', '--port', '8000', '--reload'],
    { stdio: 'inherit' },
  ),
  spawn('npm', ['--prefix', 'frontend', 'run', 'dev', '--', '--host', '0.0.0.0'], {
    stdio: 'inherit',
  }),
]
let closing = false
function stop(code = 0) {
  if (closing) return
  closing = true
  children.forEach((c) => c.kill('SIGTERM'))
  process.exitCode = code
}
children.forEach((c) => {
  c.on('error', (e) => {
    console.error(e.message)
    stop(1)
  })
  c.on('exit', (code) => {
    if (!closing) stop(code || 0)
  })
})
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
