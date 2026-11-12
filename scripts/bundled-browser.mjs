// Optional browser for sandboxes whose outbound network only permits npm.
// Normal development/CI can use `npx playwright install --with-deps chromium`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { brotliDecompressSync } from 'node:zlib'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import chromium from '@sparticuz/chromium'
export async function bundledBrowser() {
  const directory = resolve('.cache/browser-libs')
  mkdirSync(directory, { recursive: true })
  const archive = resolve(directory, 'libs.tar')
  writeFileSync(
    archive,
    brotliDecompressSync(
      readFileSync(resolve('node_modules/@sparticuz/chromium/bin/al2023.tar.br')),
    ),
  )
  execFileSync('tar', ['-xf', archive, '-C', directory])
  return {
    executablePath: await chromium.executablePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${directory}/lib${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}`,
    },
  }
}
