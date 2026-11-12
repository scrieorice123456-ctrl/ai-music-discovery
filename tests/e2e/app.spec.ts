import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function openPage(page: Page, label: string) {
  const mobile = page.getByRole('button', { name: 'Open navigation' })
  if (await mobile.isVisible()) await mobile.click()
  await page.getByRole('link', { name: label, exact: true }).click()
}
async function ready(page: Page) {
  await page.goto('/')
  await expect(page.locator('.track-card')).toHaveCount(4)
}

test('discover is real, responsive, and has no browser errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await ready(page)
  await expect(page.getByRole('heading', { name: 'Meet your next on-repeat.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sample profile' })).toBeVisible()
  await page.getByRole('button', { name: 'View all picks' }).click()
  await expect(page.locator('.track-card')).toHaveCount(20)
  await page.getByRole('button', { name: 'Show less' }).click()
  await page.getByRole('button', { name: 'Focus', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Focus', exact: true })).toHaveClass('selected')
  await expect(page.locator('.track-grid')).not.toHaveClass(/is-fetching/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  expect(errors).toEqual([])
})

test('save a find, persist it across reload, and remove it', async ({ page }) => {
  await ready(page)
  const card = page.locator('.track-card').first()
  const title = await card.locator('h3').innerText()
  await card.hover()
  await card.locator('.card-save').click()
  await openPage(page, 'Your library')
  await expect(page.locator('.list-title').filter({ hasText: title })).toBeVisible()
  await page.reload()
  await expect(page.locator('.list-title').filter({ hasText: title })).toBeVisible()
  await page
    .locator('.list-actions')
    .getByRole('button', { name: `Unsave ${title}`, exact: true })
    .click()
  await expect(page.getByRole('heading', { name: 'Your next keeper is out there.' })).toBeVisible()
})

test('adjust the mix with a keyboard and persist settings', async ({ page }) => {
  await ready(page)
  await page.getByRole('button', { name: 'Make it your mix' }).click()
  const dialog = page.getByRole('dialog')
  const slider = dialog.getByLabel('Familiar sounds percentage')
  await slider.focus()
  await slider.press('End')
  await dialog.getByRole('button', { name: 'Save my mix' }).click()
  await expect(dialog).not.toBeVisible()
  await page.reload()
  await expect(page.locator('.mix-legend').getByText('100%')).toBeVisible()
  const mix = await page.evaluate(
    async () => (await (await fetch('/api/bootstrap')).json()).settings,
  )
  expect(mix).toEqual({ similar: 100, discovery: 0, experimental: 0 })
})

test('sample import runs the parser, changes taste, and deduplicates', async ({ page }) => {
  await ready(page)
  await openPage(page, 'Import history')
  await page.getByRole('button', { name: 'Try a sample import' }).click()
  await expect(page.getByRole('heading', { name: 'We’re getting to know you.' })).toBeVisible()
  await expect(page.locator('.import-result-stats').getByText('20', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Your profile', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Try a sample import' }).click()
  await expect(page.getByRole('heading', { name: 'Already part of your story.' })).toBeVisible()
  const taste = await page.evaluate(
    async () => (await (await fetch('/api/bootstrap')).json()).taste,
  )
  expect(taste.plays).toBe(20)
  await page.getByRole('button', { name: 'Find my next favorite' }).click()
  await expect(page.locator('.track-card')).toHaveCount(4)
  await expect(page.locator('.demo-notice')).not.toBeVisible()
})

test('invalid imports show useful errors without destroying the sample profile', async ({
  page,
}) => {
  await ready(page)
  await openPage(page, 'Import history')
  await page.locator('#history-file').setInputFiles({
    name: 'music.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{bad json'),
  })
  await page.getByRole('button', { name: 'Import & find my sound' }).click()
  await expect(page.getByRole('alert')).toContainText('JSON file is invalid')
  await expect(page.getByRole('button', { name: 'Sample profile' })).toBeVisible()
})

test('local search and radio offer legitimate playback fallbacks', async ({ page }) => {
  await page.route('**/api/tracks/*/preview', (route) =>
    route.fulfill({
      json: {
        available: false,
        message: 'No official preview is available for this recording in your region.',
      },
    }),
  )
  await ready(page)
  await page.locator('.global-search').click()
  await page.getByRole('textbox', { name: 'Search music', exact: true }).fill('Bonobo')
  await expect(page.locator('.search-results .track-row').first()).toBeVisible()
  await page.locator('.search-results .list-art-button').first().click()
  await expect(
    page.getByRole('heading', { name: 'The discovery’s here. The preview isn’t.' }),
  ).toBeVisible()
  await expect(
    page.locator('.playback-fallback').getByRole('link', { name: 'YouTube Music' }),
  ).toHaveAttribute('href', /^https:\/\/music.youtube.com\//)
  const title = await page.locator('.radio-track-info h2').innerText()
  await page.getByRole('button', { name: 'Next discovery', exact: true }).click()
  await expect(page.locator('.radio-track-info h2')).not.toHaveText(title)
  await page.getByRole('button', { name: 'Open official music sources', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Apple Music' })).toHaveAttribute(
    'href',
    /^https:\/\/music.apple.com\//,
  )
})

test('known feedback excludes a song from future recommendations', async ({ page }) => {
  await ready(page)
  const title = await page.locator('.track-card h3').first().innerText()
  await page.locator('.reason-button').first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'I already know this' }).click()
  await expect(page.locator('.track-card h3').filter({ hasText: title })).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.track-card h3').filter({ hasText: title })).toHaveCount(0)
})

test('keyboard-accessible discovery passes automated WCAG A/AA checks', async ({ page }) => {
  await ready(page)
  await page.waitForTimeout(400) // let the entry transition finish before contrast measurement
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze()
  expect(results.violations).toEqual([])
})

// Generated only in this test's network interception; not a catalog recording.
function testTone(seconds = 3) {
  const rate = 16000
  const samples = seconds * rate
  const wav = Buffer.alloc(44 + samples * 2)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(rate, 24)
  wav.writeUInt32LE(rate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(Math.round(Math.sin((i / rate) * Math.PI * 440) * 300), 44 + i * 2)
  return wav
}

test('media preview completes, learns a listening event, and advances the radio', async ({
  page,
}) => {
  const wav = testTone()
  await page.route('**/api/tracks/*/preview', (route) =>
    route.fulfill({
      json: {
        available: true,
        preview_url: 'https://audio-ssl.itunes.apple.com/test-preview.wav',
        source_url: 'https://music.apple.com/ro/',
      },
    }),
  )
  await page.route('https://audio-ssl.itunes.apple.com/test-preview.wav', (route) =>
    route.fulfill({ contentType: 'audio/wav', body: wav }),
  )
  await ready(page)
  const before = await page.evaluate(
    async () => (await (await fetch('/api/bootstrap')).json()).taste.plays,
  )
  await page.getByRole('button', { name: 'Start my radio', exact: true }).click()
  await expect(
    page.locator('.now-playing-card').getByRole('button', { name: 'Pause radio' }),
  ).toBeVisible()
  const first = await page.locator('.radio-track-info h2').innerText()
  await expect
    .poll(
      async () =>
        page.evaluate(async () => (await (await fetch('/api/bootstrap')).json()).taste.plays),
      { timeout: 10000 },
    )
    .toBeGreaterThan(before)
  await expect(page.locator('.radio-track-info h2')).not.toHaveText(first)
  await expect(page.locator('.playback-fallback')).not.toBeVisible()
})

test('settings export and confirmed deletion are functional', async ({ page }) => {
  await ready(page)
  await openPage(page, 'Settings & privacy')
  const download = page.waitForEvent('download')
  await page.getByRole('link', { name: 'Export data' }).click()
  expect((await download).suggestedFilename()).toBe('my-music-discovery.json')
  await page.getByRole('button', { name: 'Delete data', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('can’t be undone')
  await page.getByRole('dialog').getByRole('button', { name: 'Yes, delete my data' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect
    .poll(async () =>
      page.evaluate(async () => (await (await fetch('/api/bootstrap')).json()).taste.plays),
    )
    .toBe(0)
  await expect(page.getByRole('button', { name: 'Your profile', exact: true })).toBeVisible()
})

test('every page remains usable without horizontal overflow', async ({ page }) => {
  await ready(page)
  for (const label of [
    'AI Radio',
    'Your library',
    'Your taste',
    'Import history',
    'Settings & privacy',
  ]) {
    await openPage(page, label)
    await expect(page.locator('main h1')).toBeVisible()
    await page.waitForTimeout(350)
    const accessibility = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze()
    expect(accessibility.violations, label).toEqual([])
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      label,
    ).toBeTruthy()
  }
})

test('embedded Arena preview keeps a secure, partitioned session across mutations', async ({
  page,
  context,
}) => {
  // Test-only HTTPS reverse proxy: no request leaves the sandbox and no API
  // client's cookie jar can accidentally stand in for the browser's CHIPS cookie.
  const { request: httpRequest } = await import('node:http')
  const preview = 'https://3000-music-test.e2b.app'
  await page.route('https://arena.ai/music-test', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html><body><iframe id="preview" src="${preview}/" style="width:100%;height:100vh"></iframe></body></html>`,
    }),
  )
  await page.route(`${preview}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const response = await new Promise<{
      status: number
      headers: Record<string, string>
      body: Buffer
    }>((resolve, reject) => {
      const upstream = httpRequest(
        `http://127.0.0.1:3000${url.pathname}${url.search}`,
        {
          method: request.method(),
          headers: { ...request.headers(), host: url.host },
        },
        (res) => {
          const chunks: Buffer[] = []
          res.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          res.on('end', () => {
            const headers: Record<string, string> = {}
            for (const [key, value] of Object.entries(res.headers)) {
              if (value && !['connection', 'transfer-encoding'].includes(key))
                headers[key] = Array.isArray(value) ? value[0] : value
            }
            resolve({ status: res.statusCode || 500, headers, body: Buffer.concat(chunks) })
          })
        },
      )
      upstream.on('error', reject)
      upstream.end(request.postDataBuffer() || undefined)
    })
    await route.fulfill(response)
  })
  await page.goto('https://arena.ai/music-test')
  await page.frameLocator('#preview').locator('.track-card').first().waitFor()
  const frame = page.frames().find((f) => f.url().startsWith(preview))!
  const result = await frame.evaluate(async () => {
    const boot = await (await fetch('/api/bootstrap')).json()
    const write = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': boot.csrf_token },
      body: JSON.stringify({ similar: 60, discovery: 25, experimental: 15 }),
    })
    return { status: write.status, mix: (await (await fetch('/api/bootstrap')).json()).settings }
  })
  expect(result).toEqual({ status: 200, mix: { similar: 60, discovery: 25, experimental: 15 } })
  const cookie = (await context.cookies(preview)).find((c) => c.name === 'music_session')!
  expect(cookie.httpOnly).toBeTruthy()
  expect(cookie.secure).toBeTruthy()
  expect(cookie.sameSite).toBe('None')
})
