// Manual full-browser QA using fake catalog/account data only.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const path = require('node:path'), assert = require('node:assert/strict');
(async () => {
  let preview;
  async function startPreview() {
    preview = spawn(process.execPath, [path.join(__dirname, 'admin-preview.cjs')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Preview failed to start')), 10000);
      preview.stdout.once('data', () => { clearTimeout(timer); resolve(); }); preview.once('error', reject);
    });
  }
  let browser;
  try {
    browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
    for (const width of [320, 390, 1280]) {
      await startPreview();
      const page = await browser.newPage({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:3102/');
      await page.waitForFunction(() => document.body.dataset.menuAccess === 'member' && document.querySelector('#catalogGrid .catalog-card'));
      await page.locator('#menuChat summary').focus(); await page.keyboard.press('Enter');
      const ask = async text => {
        await page.locator('#chatMessage').fill(text); await page.locator('#chatSend').click();
        await page.waitForFunction(() => document.querySelector('#chatStatus').textContent === 'Reply ready.' || /suggestions ready/.test(document.querySelector('#chatStatus').textContent));
      };
      await ask('coffee under PHP 150');
      assert.ok(await page.locator('#chatResults .catalog-card').count() > 0);
      await ask('make it cold');
      assert.match(await page.locator('#chatPreferences').textContent(), /cold portions.*150/);
      const portions = await page.locator('#chatResults .catalog-option-label').allTextContents();
      assert.ok(portions.every(value => /Cold/.test(value) && !/Hot/.test(value)));
      await page.locator('#chatResults .cart-add').first().click();
      assert.match(await page.locator('.cart-launcher').textContent(), /View cart · 1/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (process.env.QA_SCREENSHOT_DIR) {
        await page.locator('#menuChat').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + scrollY - 16));
        await page.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, 'chat-' + width + '.png') });
      }
      await page.locator('#chatReset').click(); await page.locator('#chatHistory').check();
      await ask('my usual'); assert.match(await page.locator('#chatLog').textContent(), /no completed orders/);
      await page.locator('#chatReset').click(); await ask('I have a nut allergy');
      assert.equal(await page.locator('#chatResults .catalog-card').count(), 0);
      assert.match(await page.locator('#chatLog').textContent(), /cannot verify ingredients/);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('customer-access-changed', { detail: { signedIn: false } })));
      await ask('desserts under 150'); assert.equal(await page.locator('#chatResults .cart-add').count(), 0);
      assert.equal(await page.locator('#chatHistory').isDisabled(), true);
      await page.route('**/api/chat', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Please retry.' }) }));
      await page.locator('#chatMessage').fill('drinks'); await page.locator('#chatSend').click();
      await page.locator('#chatRetry').waitFor({ state: 'visible' });
      await page.unroute('**/api/chat'); await page.locator('#chatRetry').click();
      await page.waitForFunction(() => document.querySelector('#chatResults .catalog-card'));
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log('PASS chat follow-ups, cart, keyboard, privacy controls, dietary guidance and retry at ' + width + 'px');
      await page.close();
      await new Promise(resolve => { preview.once('exit', resolve); preview.kill(); });
    }
  } finally { await browser?.close(); preview?.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
