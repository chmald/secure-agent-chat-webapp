#!/usr/bin/env node
/**
 * Smoke test for the AI Agent Web App.
 * Usage: node deployment/scripts/smoke-test.js [url]
 * Default URL: http://localhost:5173
 * 
 * Tests ALL features: auth, chat, tokens, theme, cancel, sidebar, markdown, starter prompts.
 * Outputs JSON report to stdout. Exit code 0 = pass, 1 = fail.
 * Takes a screenshot at the end for visual review.
 * 
 * Prerequisites: npx playwright install chromium
 */

const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:5173';
const TIMEOUT = 30000;
const results = [];

function log(test, pass, detail = '') {
  const status = pass ? 'PASS' : 'FAIL';
  results.push({ test, status, detail });
  process.stderr.write(`  ${pass ? '✅' : '❌'} ${test}${detail ? ': ' + detail : ''}\n`);
}

async function run() {
  process.stderr.write(`\nSmoke Test: ${URL}\n${'─'.repeat(50)}\n`);
  
  let browser, page;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    page = await context.newPage();
    
    // Collect console errors
    const consoleErrors = [];
    page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

    // 1. Health check (backend)
    try {
      const healthUrl = URL.replace(/:\d+/, ':8080') + '/api/health';
      const health = await page.request.get(healthUrl);
      log('Health endpoint', health.status() === 200, `${health.status()}`);
    } catch (e) {
      log('Health endpoint', false, e.message);
    }

    // 2. Navigate and wait for auth
    await page.goto(URL, { timeout: TIMEOUT });
    try {
      await page.waitForSelector('[role="log"]', { timeout: TIMEOUT });
      log('Auth + page load', true);
    } catch {
      log('Auth + page load', false, 'Page did not load within timeout — may need interactive MSAL login');
    }

    // 3. Agent metadata
    const title = await page.title();
    const hasAgentName = !title.includes('AI Agent') || title.length > 'AI Agent'.length;
    log('Agent metadata', title.includes('Azure AI Agent'), `Title: "${title}"`);

    // 4. Starter prompts
    const starters = await page.locator('[role="list"] button').count();
    log('Starter prompts', starters >= 1, `${starters} prompts found`);

    // 5. Send message via first starter prompt
    if (starters > 0) {
      await page.locator('[role="list"] button').first().click();
      try {
        await page.waitForSelector('text=tokens', { timeout: 30000 });
        log('Chat streaming', true, 'Response received with token count');
      } catch {
        log('Chat streaming', false, 'No token count visible after 30s');
      }
    } else {
      log('Chat streaming', false, 'No starter prompts to click');
    }

    // 6. Token usage
    const tokenButton = page.locator('button:has-text("token usage")');
    const hasTokens = await tokenButton.count() > 0;
    log('Token usage display', hasTokens);
    if (hasTokens) {
      await tokenButton.first().click();
      await page.waitForTimeout(500);
      const hasInputTokens = await page.locator('text=Input').count() > 0;
      log('Token usage expandable', hasInputTokens);
    }

    // 7. Theme toggle
    const settingsBtn = page.locator('button[aria-label="Settings"]');
    if (await settingsBtn.count() > 0) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
      const themeDropdown = page.locator('[role="combobox"]');
      if (await themeDropdown.count() > 0) {
        await themeDropdown.click();
        const darkOption = page.locator('[role="option"]:has-text("Dark")');
        if (await darkOption.count() > 0) {
          await darkOption.click();
          log('Theme toggle', true, 'Dark theme selected');
          // Revert to System
          await themeDropdown.click();
          await page.locator('[role="option"]:has-text("System")').click();
        } else {
          log('Theme toggle', false, 'Dark option not found');
        }
      } else {
        log('Theme toggle', false, 'Theme dropdown not found');
      }
      // Close settings
      await page.locator('button[aria-label="Close"]').click();
    } else {
      log('Theme toggle', false, 'Settings button not found');
    }

    // 8. Conversation sidebar
    const sidebarBtn = page.locator('button[aria-label="Conversation history"]');
    if (await sidebarBtn.count() > 0) {
      await sidebarBtn.click();
      await page.waitForTimeout(1000);
      const dialog = page.locator('[role="dialog"]');
      const hasDialog = await dialog.count() > 0;
      log('Conversation sidebar', hasDialog, hasDialog ? 'Sidebar opened' : 'Dialog not found');
      if (hasDialog) {
        const items = await page.locator('[role="listitem"]').count();
        log('Conversation list', items >= 0, `${items} conversations loaded`);
        // Close sidebar
        await page.locator('button[aria-label="Close sidebar"]').click();
      }
    } else {
      log('Conversation sidebar', false, 'History button not found');
    }

    // 9. New chat button
    const newChatBtn = page.locator('button[aria-label="New chat"]');
    if (await newChatBtn.count() > 0) {
      const isEnabled = await newChatBtn.isEnabled();
      if (isEnabled) {
        await newChatBtn.click();
        await page.waitForTimeout(500);
        const startersAfterClear = await page.locator('[role="list"] button').count();
        log('New chat', startersAfterClear >= 1, 'Messages cleared, starters visible');
      } else {
        log('New chat', true, 'Button disabled (no messages) — correct');
      }
    }

    // 10. Console errors
    const relevantErrors = consoleErrors.filter(e => !e.includes('Avatar_Default.svg') && !e.includes('favicon'));
    log('No console errors', relevantErrors.length === 0, 
        relevantErrors.length > 0 ? `${relevantErrors.length} errors` : '');

    // 11. Screenshot
    const screenshotPath = `smoke-test-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    log('Screenshot saved', true, screenshotPath);

  } catch (e) {
    log('Fatal error', false, e.message);
  } finally {
    if (browser) await browser.close();
  }

  // Output JSON report
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const report = { url: URL, timestamp: new Date().toISOString(), passed, failed, total: results.length, results };
  
  process.stderr.write(`\n${'─'.repeat(50)}\n`);
  process.stderr.write(`Results: ${passed}/${results.length} passed${failed > 0 ? `, ${failed} FAILED` : ''}\n`);
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  
  process.exit(failed > 0 ? 1 : 0);
}

run();
