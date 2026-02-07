import { chromium } from 'playwright'

const run = async () => {
	const browser = await chromium.launch({ headless: true })
	const page = await browser.newPage()

	page.on('console', msg => {
		console.log(`[browser:${msg.type()}] ${msg.text()}`)
	})
	page.on('pageerror', err => {
		console.error('[pageerror]', err)
	})

	await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
	await page.waitForTimeout(2000)
	const title = await page.title()
	console.log(`[info] title: ${title}`)
	await page.screenshot({ path: 'playwright-screenshot.png', fullPage: true })
	await browser.close()
}

run().catch(err => {
	console.error('[smoke] failed', err)
	process.exit(1)
})
