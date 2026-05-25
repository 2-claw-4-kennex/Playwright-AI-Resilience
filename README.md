# playwright-ai-resilience

[![npm version](https://img.shields.io/npm/v/playwright-ai-resilience.svg?style=flat-square)](https://npmjs.com/package/playwright-ai-resilience)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-15%2F15%20passing-brightgreen.svg?style=flat-square)]()

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

```gitignore
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

---

## How It Works

### First green run

`safeAssert()` succeeds normally, then silently records a fingerprint of the element to:

```text
.resilience/baselines.json
```

### Later, when the selector breaks

The engine:

1. Loads the stored fingerprint
2. Scans nearby DOM candidates
3. Scores them using:
   - semantic text similarity
   - ARIA metadata
   - structural lineage
   - spatial position
   - class similarity
4. Selects the best candidate above the risk threshold
5. Executes the action
6. Verifies the outcome

### If verification fails

The engine rolls back page state and throws the original Playwright error.

Your test suite is never silently corrupted.

---

## Suggest Mode (Recommended Starting Point)

Not ready for automatic healing yet?

Run in `suggest` mode.

The engine identifies the best recovery candidate and prints it — no action is executed.

```typescript
await safeAssert(page, {
  selector: '#checkout-btn',
  action: (locator) => locator.click(),
  mode: 'suggest',
});
```

Example output:

```text
╔═══ playwright-ai-resilience ══════════════════════╗
✖  Original selector failed: #checkout-btn
↺  Scanning DOM neighborhood... 30 candidates found

→ [1] ████████░░ 0.872  [data-testid="checkout-v2"]  "pay now"
  [2] ████░░░░░░ 0.412  button.cancel-btn            "cancel"
  [3] ██░░░░░░░░ 0.201  a.nav-link                   "checkout"

⚠  [SUGGEST MODE] No action executed.
   To heal automatically, use mode: "execute"

╚═══════════════════════════════════════════════════╝
```

---

## Risk Levels

| Level      | Score Threshold | Auto Execute |
|------------|----------------|---------------|
| `low`      | > 0.60         | Yes |
| `medium`   | > 0.75         | Yes |
| `high`     | > 0.90         | Yes |
| `critical` | Any            | No — Suggest only |

Selectors containing:

- `delete`
- `remove`
- `pay`
- `transfer`
- `password`

are **never auto-healed** unless explicitly overridden with:

```typescript
riskLevel: 'critical'
```

---

## Verify Helpers

```typescript
verify.urlTransition(/.*\/payment/)

verify.elementVisible('.success-toast')

verify.networkRequest('/api/checkout')
```

---

## CLI

```bash
npx resilience status
npx resilience list
npx resilience log
npx resilience clear '#checkout-btn'
npx resilience clear-all
```

### Commands

| Command | Description |
|---|---|
| `status` | Show baseline statistics |
| `list` | List all recorded selectors |
| `log` | Show recent recovery events |
| `clear` | Delete one baseline |
| `clear-all` | Delete all baselines |

---

## Disable Healing Per Action

```typescript
await safeAssert(page, {
  selector: '#payment-submit',
  action: (locator) => locator.click(),
  healing: 'disabled',
});
```

This behaves exactly like normal Playwright and never attempts recovery.

---

## What Gets Stored

`.resilience/baselines.json` stores minimal fingerprints only.

No:
- raw HTML
- screenshots
- computed CSS
- network data

Example:

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

## Project Layout

```text
src/
  index.ts
  cli.ts

  core/
    schema.ts
    baselineCache.ts
    safeAssert.ts
    fingerprint.ts
    scoringEngine.ts
    browserScript.ts

tests/
  harness.ts
  corpus/fixtures.ts
  integration.test.ts
```

---

## Harness Results (Synthetic Fixtures)

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

These are synthetic fixtures.

Add your own real broken selectors to:

```text
tests/corpus/fixtures.ts
```

Then run:

```bash
npm run harness
```

to measure actual recovery accuracy on your codebase.

---

## Development

```bash
npm install

npm run harness

npx playwright install chromium

npx ts-node tests/integration.test.ts
```

---

## License

MIT License © 2026 Aryan Sanskar Ahuja

See the [LICENSE](LICENSE) file for details.

---

## Author

**Aryan Sanskar Ahuja**

- GitHub: [@2-claw-4-kennex](https://github.com/2-claw-4-kennex)
- LinkedIn: [aryan-sanskar-ahuja](https://www.linkedin.com/in/aryan-sanskar-ahuja-49804a308/)

If this tool saved your CI pipeline, consider giving the repo a ⭐ on GitHub!
