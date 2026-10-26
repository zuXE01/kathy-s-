// Manual browser QA using the existing fake-data preview; no live account or database.
// Supply Playwright via NODE_PATH if it is not installed locally.
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const preview = spawn(process.execPath, [path.join(__dirname, 'admin-preview.cjs')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Preview did not start')), 10000);
      preview.stdout.once('data', () => { clearTimeout(timer); resolve(); });
      preview.once('error', reject);
    });
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
    for (const width of [320, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:3102/', { timeout: 15000 });
      await page.waitForFunction(() => document.body.dataset.menuAccess === 'member');
      await page.waitForFunction(() => document.querySelector('#catalogGrid .catalog-card'));
      await page.locator('#recommendations summary').click();
      await page.locator('#recommendationGroup').selectOption('coffee');
      await page.locator('#recommendationBudget').fill('150');
      await page.getByRole('button', { name: 'Find suggestions' }).click();
      await page.waitForFunction(() => document.querySelector('#recommendationGrid .catalog-card'));
      assert.ok(await page.locator('#recommendationGrid .catalog-card').count() <= 4);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (process.env.QA_SCREENSHOT_DIR) {
        await page.locator('#recommendations').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(process.env.QA_SCREENSHOT_DIR, 'recommendations-' + width + '.png'), fullPage: false });
      }
      await page.locator('#recommendationGrid .cart-add').first().click();
      assert.match(await page.locator('.cart-launcher').textContent(), /View cart · 1/);
      await page.locator('#recommendationHistory').check();
      await page.getByRole('button', { name: 'Find suggestions' }).click();
      await page.waitForFunction(() => document.querySelector('#recommendationStatus').textContent.includes('No completed orders'));
      await page.locator('#recommendationBudget').fill('0.01');
      await page.getByRole('button', { name: 'Find suggestions' }).click();
      await page.waitForFunction(() => document.querySelector('#recommendationStatus').textContent.startsWith('No items match'));
      // Exercise the public experience and native keyboard disclosure too.
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('customer-access-changed', { detail: { signedIn: false } })));
      await page.locator('#recommendationBudget').fill('150');
      await page.getByRole('button', { name: 'Find suggestions' }).click();
      await page.waitForFunction(() => document.querySelector('#recommendationGrid .catalog-card'));
      assert.equal(await page.locator('#recommendationGrid .cart-add').count(), 0);
      assert.equal(await page.locator('#recommendationHistory').isDisabled(), true);
      await page.locator('#recommendations summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#recommendations').getAttribute('open'), null);
      await page.keyboard.press('Enter');
      assert.notEqual(await page.locator('#recommendations').getAttribute('open'), null);
      await page.route('**/api/recommendations', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Suggestions unavailable. Please retry.' }) }));
      await page.getByRole('button', { name: 'Find suggestions' }).click();
      await page.waitForFunction(() => document.querySelector('#recommendationStatus').hasAttribute('data-error'));
      assert.equal(await page.getByRole('button', { name: 'Find suggestions' }).isEnabled(), true);
      assert.ok(await page.locator('#catalogGrid .catalog-card').count() > 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      console.log('PASS layout, recommendations, cart, history fallback, no matches, guest access, keyboard disclosure and failure recovery at ' + width + 'px');
      await page.close();
    }
  } finally { await browser?.close(); preview.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
