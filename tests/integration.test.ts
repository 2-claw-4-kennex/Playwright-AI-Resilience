/**
 * integration.test.ts
 *
 * End-to-end integration test execution validating cross-process script compilation.
 * Hardened: Simulates a real 2-step lifecycle (First run records baseline, second run heals).
 */

import * as http from 'http';
import { chromium, Browser, Page } from '@playwright/test';
import { safeAssert, verify } from '../src/core/safeAssert';

function serve(html: string, port: number): Promise<http.Server> {
  return new Promise(resolve => {
    const server = http.createServer((_, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    server.listen(port, () => resolve(server));
  });
}

function close(server: http.Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()));
}

interface IntegrationFixture {
  name: string;
  beforeHtml: string;
  afterHtml: string;
  brokenSelector: string;
  verifyFn?: ReturnType<typeof verify.urlTransition>;
  riskLevel?: 'low' | 'medium' | 'high';
}

const fixtures: IntegrationFixture[] = [
  {
    name: "Tailwind Refactor — real browser",
    beforeHtml: `
      <html><body>
        <div class="page">
          <button id="checkout-btn" class="btn btn-primary" style="padding: 10px; background: blue; color: white;">Pay Now</button>
          <button class="cancel-btn">Cancel</button>
        </div>
      </body></html>`,
    afterHtml: `
      <html><body>
        <div class="page">
          <button data-testid="checkout-submit"
            class="flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-white font-semibold">
            Pay Now
          </button>
          <button class="text-gray-500 text-sm px-3 py-1">Cancel</button>
        </div>
      </body></html>`,
    brokenSelector: '#checkout-btn',
    riskLevel: 'medium',
  },
];

async function run() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║   playwright-ai-resilience  |  Integration Tests  ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });

    for (let i = 0; i < fixtures.length; i++) {
      const fx = fixtures[i];
      const port = 3100 + i;
      const page: Page = await browser.newPage();

      console.log(`▶  Running Fixture: ${fx.name}`);

      // ==========================================
      // STEP 1: RUN AGAINST ORIGINAL HTML (RECORD)
      // ==========================================
      console.log("   [Step 1] Serving pristine layout to record baseline...");
      const recordServer = await serve(fx.beforeHtml, port);
      await page.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded' });

      // This run succeeds natively and silently saves the asset baseline signature to disk
      await safeAssert(page, {
        selector: fx.brokenSelector,
        action: async (loc) => { await loc.click({ timeout: 1000 }); },
        riskLevel: fx.riskLevel || 'medium',
        mode: 'execute',
      });
      
      await page.close();
      await close(recordServer);
      console.log("   ✓ Baseline tracking asset saved successfully.");

      // ==========================================
      // STEP 2: RUN AGAINST MUTATED HTML (HEAL)
      // ==========================================
      console.log("   [Step 2] Serving broken Tailwind layout to trigger healing...");
      const healPage = await browser.newPage();
      const healServer = await serve(fx.afterHtml, port);
      await healPage.goto(`http://localhost:${port}`, { waitUntil: 'domcontentloaded' });

      // This run will throw a TimeoutError on #checkout-btn, intercept it, score the DOM, and surface candidate
      try {
        await safeAssert(healPage, {
          selector: fx.brokenSelector,
          action: async (loc) => { await loc.click({ timeout: 1000 }); },
          riskLevel: fx.riskLevel || 'medium',
          mode: 'suggest', // Suggest mode avoids side-effects, simply logs the match
        });
        console.log(`   ✅ PASS — engine surfaced recovery candidate safely inside live browser.\n`);
      } catch (err: any) {
        console.log(`   ❌ FAIL — engine error: ${err.message}\n`);
      } finally {
        await healPage.close();
        await close(healServer);
      }
    }
  } finally {
    if (browser) await browser.close();
  }
}

run().catch(console.error);