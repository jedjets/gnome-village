/**
 * Local 390×844 Fit + Raise stills for softiso-0762 glance.
 * Usage: node scripts/capture-softiso0762.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core'
import { createServer } from 'http'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = join(__dirname, '..')
const dist = join(root, 'dist')
const outDir = '/workspace/gnome-village-review/softiso-0762'
const SEED = 0x6e0f1e
const W = 390
const H = 844

mkdirSync(outDir, { recursive: true })

const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
}

function serveDist(port) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let path = decodeURIComponent((req.url || '/').split('?')[0])
      if (path.startsWith('/gnome-village')) path = path.slice('/gnome-village'.length) || '/'
      if (path === '/') path = '/index.html'
      const file = join(dist, path)
      if (!file.startsWith(dist) || !existsSync(file)) {
        res.writeHead(404)
        res.end('missing ' + path)
        return
      }
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
      res.end(readFileSync(file))
    })
    srv.listen(port, '127.0.0.1', () => resolve(srv))
  })
}

function serveFile(port, filePath) {
  return new Promise((resolve) => {
    const body = readFileSync(filePath)
    const srv = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(body)
    })
    srv.listen(port, '127.0.0.1', () => resolve(srv))
  })
}

async function main() {
  const appSrv = await serveDist(4177)
  const oldSrv = await serveFile(4178, '/workspace/gnome-village-refs/old-prototype.html')

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      `--window-size=${W},${H}`,
    ],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 2 },
  })

  try {
    // --- New app Fit ---
    const page = await browser.newPage()
    await page.goto(`http://127.0.0.1:4177/gnome-village/?seed=${SEED}`, { waitUntil: 'networkidle0', timeout: 60000 })
    await page.waitForSelector('button.btn-primary', { timeout: 15000 })
    await page.click('button.btn-primary') // Begin
    // Wait for auto-fit paint
    await page.waitForFunction(() => {
      const canvas = document.querySelector('canvas')
      return canvas && canvas.width > 100
    }, { timeout: 15000 })
    await new Promise((r) => setTimeout(r, 900))
    await page.screenshot({ path: join(outDir, '01-fit-begin.png'), type: 'png' })

    // Raise stroke — click Raise tool then drag on canvas
    const buttons = await page.$$('button')
    for (const b of buttons) {
      const t = await page.evaluate((el) => el.textContent?.trim(), b)
      if (t === 'Raise') {
        await b.click()
        break
      }
    }
    await new Promise((r) => setTimeout(r, 200))
    const canvas = await page.$('canvas')
    const box = await canvas.boundingBox()
    // Crown-ish stroke (upper-center of isle)
    const x0 = box.x + box.width * 0.48
    const y0 = box.y + box.height * 0.42
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    for (let i = 0; i <= 12; i++) {
      await page.mouse.move(x0 + i * 2.2, y0 - i * 1.4)
      await new Promise((r) => setTimeout(r, 30))
    }
    await page.mouse.up()
    await new Promise((r) => setTimeout(r, 500))
    await page.screenshot({ path: join(outDir, '02-raise-stroke.png'), type: 'png' })
    await page.close()

    // --- Old prototype reference stills ---
    // Old prototype: dismiss intro Begin, then Fit the isle
    try {
      const old = await browser.newPage()
      await old.goto(`http://127.0.0.1:4178/#s=${SEED}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await new Promise((r) => setTimeout(r, 1500))
      await old.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"], .btn, a, div')]
        const begin = btns.find((b) => /^\s*Begin\s*$/i.test((b.textContent || '').trim()))
        if (begin) begin.click()
      })
      await old.waitForSelector('canvas', { timeout: 45000 }).catch(() => null)
      await new Promise((r) => setTimeout(r, 4000))
      await old.evaluate(() => {
        const btns = [...document.querySelectorAll('button, [role="button"], .chip, .btn, a')]
        const fit = btns.find((b) => /\bfit\b/i.test(b.textContent || b.getAttribute('aria-label') || ''))
        if (fit) fit.click()
      })
      await new Promise((r) => setTimeout(r, 2000))
      await old.screenshot({ path: join(outDir, 'old-html-fit.png'), type: 'png' })
      await old.close()
    } catch (e) {
      console.warn('old-html capture failed:', e.message)
    }

    // Side-by-side vs old HTML + optional 076|075
    const { execFileSync } = await import('child_process')
    const fitNew = join(outDir, '01-fit-begin.png')
    const oldFit = existsSync(join(outDir, 'old-html-fit.png'))
      ? join(outDir, 'old-html-fit.png')
      : '/workspace/gnome-village-review/softiso-074/old-html-fit.png'
    const fit075 = '/workspace/gnome-village-review/softiso-0761/01-fit-begin.png'
    try {
      if (existsSync(fitNew) && existsSync(oldFit)) {
        execFileSync('convert', [
          fitNew, oldFit, '+append',
          '-resize', '780x844!',
          join(outDir, 'compare-fit-new-vs-old.png'),
        ], { stdio: 'inherit' })
      }
      if (existsSync(fitNew) && existsSync(fit075)) {
        execFileSync('convert', [
          fitNew, fit075, '+append',
          join(outDir, 'compare-fit-0762-vs-0761.png'),
        ], { stdio: 'inherit' })
      }
    } catch (e) {
      console.warn('SBS convert failed:', e.message)
    }

    console.log('stills written to', outDir)
  } finally {
    await browser.close()
    appSrv.close()
    oldSrv.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
