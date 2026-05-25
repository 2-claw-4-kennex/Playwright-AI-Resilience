```markdown
# playwright-ai-resilience

Your Playwright tests passed yesterday.  
Today a frontend engineer renamed `#checkout-btn` to `data-testid="checkout-v2"`.  
Your CI pipeline is red. Your deploy is blocked.

This package catches `TimeoutError`, scans the local DOM for the closest semantic match using a deterministic heuristic engine, verifies the outcome, and heals the workflow — with zero cloud dependencies, zero API keys, and zero hosted infrastructure.

---

## Install

```bash
npm install playwright-ai-resilience

```

Add to `.gitignore`:

```
.resilience/recovery-log.jsonl

```

**Commit** `.resilience/baselines.json` — it's your team's shared selector memory.

---

## Usage

```typescript
import { safeAssert, verify } from 'playwright-ai-resilience';

// Before — breaks when the selector is renamed
await page.click('#checkout-btn');

// After — records a fingerprint on the first green run,
//         recovers from mutations on subsequent broken runs
await safeAssert(page, {
  selector: '#checkout-btn',
  action: (locator) => locator.click(),
  verify: verify.urlTransition(/.*\/payment/),
  riskLevel: 'high',
});

```

### How it works

**First green run:** `safeAssert` succeeds normally, then silently records a fingerprint of the element to `.resilience/baselines.json`.

**Later, when the selector breaks:** The engine loads the stored fingerprint, scores up to 30 nearby DOM candidates using text, ARIA, structural, and spatial signals, picks the best match above the risk threshold, clicks it, and verifies the result.

**If verification fails:** The engine rolls back page state and throws the original error — your test suite is never silently corrupted.

---

## Suggest Mode (start here)

Not ready to auto-execute? Run in `suggest` mode. The engine identifies the recovery candidate and prints it — no click happens.

```typescript
await safeAssert(page, {
  selector: '#checkout-btn',
  action: (locator) => locator.click(),
  mode: 'suggest',
});

```

```text
  ╔═══ playwright-ai-resilience ══════════════════════╗
  ✖  Original selector failed: #checkout-btn
  ↺  Scanning DOM neighborhood... 30 candidates found

  → [1] ████████░░ 0.872  [data-testid="checkout-v2"]  "pay now"
    [2] ████░░░░░░ 0.412  button.cancel-btn              "cancel"
    [3] ██░░░░░░░░ 0.201  a.nav-link                     "checkout"

  ⚠  [SUGGEST MODE] No action executed. To heal, use mode: "execute"
  ╚═══════════════════════════════════════════════════╝

```

---

## Risk Levels

| Level | Score Threshold | Auto-Execute |
| --- | --- | --- |
| `low` | > 0.60 | Yes |
| `medium` | > 0.75 | Yes |
| `high` | > 0.90 | Yes |
| `critical` | any | No — suggest only |

Selectors containing `delete`, `remove`, `pay`, `transfer`, or `password` are **never auto-healed** without `riskLevel: 'critical'`.

---

## Verify Helpers

```typescript
verify.urlTransition(/.*\/payment/)        // Waits for URL regex match
verify.elementVisible('.success-toast')    // Waits for element to appear
verify.networkRequest('/api/checkout')     // Waits for network request

```

---

## CLI

```bash
npx resilience status                  # Show how many baselines are recorded
npx resilience list                    # List all recorded selectors
npx resilience log                     # Show last 20 recovery events
npx resilience clear '#checkout-btn'   # Delete one baseline
npx resilience clear-all               # Delete all baselines

```

---

## Disable healing per-action

```typescript
await safeAssert(page, {
  selector: '#payment-submit',
  action: (locator) => locator.click(),
  healing: 'disabled',   // Will throw on failure, never attempt recovery
});

```

---

## What gets stored

`.resilience/baselines.json` stores a minimal fingerprint per selector — no raw HTML, no screenshots, no computed CSS. Example entry:

```json
{
  "selector": "#checkout-btn",
  "tag": "button",
  "semanticTokens": ["pay", "now"],
  "textHash": "a3f9c2b1d4e8f701",
  "ariaRole": "button",
  "testId": "",
  "classList": ["btn", "btn-primary"],
  "lineageVector": ["body", "main", "form", "button"],
  "spatialBucket": "bottom-right",
  "fingerprintVersion": "v1"
}

```

---

## Project layout

```text
src/
  index.ts              ← Public API
  cli.ts                ← CLI tool
  core/
    schema.ts           ← Fingerprint types (versioned)
    baselineCache.ts    ← Read/write .resilience/baselines.json
    safeAssert.ts       ← Main developer API
    fingerprint.ts      ← Feature extraction (pure, no side effects)
    scoringEngine.ts    ← Heuristic scoring (used by jsdom harness)
    browserScript.ts    ← Browser-injectable scoring IIFE

tests/
  harness.ts            ← Ground-truth grader (no browser needed)
  corpus/fixtures.ts    ← 15 synthetic breakage scenarios
  integration.test.ts   ← Real Playwright browser tests

```

---

## Harness results (synthetic fixtures)

```text
Scoring Engine:   15/15
Baseline Cache:    3/3
TOTAL:            18/18  (100.0%)

By category:
  CLASS_RENAME:    2/2
  DOM_RESTRUCTURE: 6/6
  ARIA_CHANGE:     1/1
  TEXT_MUTATION:   4/4
  ATTR_SHIFT:      2/2

```

These are synthetic. Add your real broken selectors to `tests/corpus/fixtures.ts` and run `npm run harness` to measure actual accuracy on your codebase.

---

## License

MIT

```

```

## Author

**Aryan Sanskar Ahuja** * GitHub: [@2-claw-4-kennex](https://github.com/2-claw-4-kennex)
* LinkedIn: (https://www.linkedin.com/in/aryan-sanskar-ahuja-49804a308/)

If this tool saved your CI pipeline, consider giving the repo a ⭐ on GitHub!

