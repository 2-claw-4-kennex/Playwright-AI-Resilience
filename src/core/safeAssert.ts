/**
 * safeAssert.ts (Stable V1)
 *
 * Entrypoint wrapper API for browser-side verification and self-healing.
 */

import { Page, errors as PlaywrightErrors } from '@playwright/test';
import chalk from 'chalk';
import { BROWSER_SCRIPT } from './browserScript';
import { BaselineCache, buildStoredFingerprint, RawBrowserFingerprint } from './baselineCache';
import { StoredFingerprint, RecoveryEvent } from './schema';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type Mode = 'execute' | 'suggest';

export interface VerifyFn {
  (page: Page): Promise<boolean>;
  description: string;
}

export interface SafeAssertOptions {
  selector: string;
  action: (locator: ReturnType<Page['locator']>) => Promise<void>;
  verify?: VerifyFn;
  riskLevel?: RiskLevel;
  mode?: Mode;
  healing?: 'enabled' | 'disabled';
  retryMs?: number;
}

export interface ScoredCandidate {
  outerHTML: string;
  score: number;
  selector: string;
  textContent: string;
  tagName: string;
  breakdown: Record<string, number>;
}

const THRESHOLDS: Record<RiskLevel, number> = {
  low: 0.60, medium: 0.75, high: 0.90, critical: 0.95,
};

const DANGEROUS_TOKENS = ['delete', 'remove', 'pay', 'transfer', 'password'];
const injectedPages = new WeakSet<Page>();

let _cache: BaselineCache | null = null;
function getCache(): BaselineCache {
  if (!_cache) _cache = new BaselineCache();
  return _cache;
}

async function withBudget<T>(task: () => Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Budget(${label}): ${ms}ms exceeded`)), ms);
    task().then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

async function ensureInjected(page: Page): Promise<void> {
  if (!injectedPages.has(page)) {
    await page.evaluate(BROWSER_SCRIPT);
    injectedPages.add(page);
  }
}

function printRecording(selector: string): void {
  console.log(
    chalk.cyan('\n  [resilience]') +
    chalk.green(' ● REC ') +
    `Baseline recorded for ${chalk.yellow(selector)}`
  );
}

function printRecovery(
  selector: string,
  candidates: ScoredCandidate[],
  winner: ScoredCandidate | null,
  mode: Mode,
  verified: boolean | undefined,
  rolledBack: boolean
): void {
  console.log(chalk.cyan('\n  ╔═══ playwright-ai-resilience ══════════════════════╗'));
  console.log(chalk.red(`  ✖  Original selector failed: ${chalk.yellow(selector)}`));
  console.log(chalk.cyan(`  ↺  Scanning DOM neighborhood... `) + `${candidates.length} candidates found`);

  if (candidates.length > 0) {
    console.log('');
    candidates.slice(0, 3).forEach((c, i) => {
      const bar = '█'.repeat(Math.round(c.score * 10)).padEnd(10, '░');
      const scoreStr = c.score >= 0.75
        ? chalk.green(c.score.toFixed(3))
        : c.score >= 0.50
          ? chalk.yellow(c.score.toFixed(3))
          : chalk.red(c.score.toFixed(3));
      const marker = i === 0 ? chalk.green('  →') : '   ';
      console.log(`${marker} [${i + 1}] ${bar} ${scoreStr}  ${chalk.cyan(c.selector)}  "${c.textContent.slice(0, 35)}"`);
    });
  }

  if (!winner) {
    console.log(chalk.red('\n  ✖  No candidate met threshold — failing loudly'));
  } else if (mode === 'suggest') {
    console.log(chalk.yellow('\n  ⚠  [SUGGEST MODE] No action executed. To heal, use mode: "execute"'));
    console.log(`     Selector:   ${chalk.cyan(winner.selector)}`);
    console.log(`     Score:      ${winner.score.toFixed(3)}`);
  } else if (verified) {
    console.log(chalk.green('\n  ✓  Recovery verified'));
    console.log(chalk.green(`  ✓  Selected: ${winner.selector} (score: ${winner.score.toFixed(3)})`));
  } else {
    console.log(chalk.red('\n  ✖  Verification failed'));
    if (rolledBack) console.log(chalk.yellow('  ↺  State rolled back'));
  }
  console.log(chalk.cyan('  ╚═══════════════════════════════════════════════════╝\n'));
}

async function rollback(page: Page, urlBefore: string): Promise<void> {
  const urlAfter = page.url();
  try {
    if (urlAfter !== urlBefore) {
      await page.goBack({ timeout: 3000 });
    } else {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
  } catch {}
}

const SCORE_WITH_BASELINE_FN = `
(function(baselineJSON) {
  const base = JSON.parse(baselineJSON);

  function jaccard(a, b) {
    const sa = new Set(a), sb = new Set(b);
    const inter = [...sa].filter(x => sb.has(x)).length;
    const union = new Set([...sa,...sb]).size;
    return union === 0 ? 0 : inter / union;
  }

  function lcsLen(a, b) {
    const dp = Array.from({length:a.length+1},()=>new Array(b.length+1).fill(0));
    for(let i=1;i<=a.length;i++)
      for(let j=1;j<=b.length;j++)
        dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]+1:Math.max(dp[i-1][j],dp[i][j-1]);
    return dp[a.length][b.length];
  }

  function semanticClasses(cls) {
    return cls.filter(c => !c.match(/^(flex|grid|p[xy]?-|m[xy]?-|text-|bg-|border|rounded|shadow|items-|justify-|w-|h-|font-|leading-|ring|gap-|space-|hover:|focus:|active:|sm:|md:|lg:|xl:)/));
  }

  function spatialBucket(el) {
    try {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const row = r.top < vh*0.33 ? 'top' : r.top < vh*0.66 ? 'center' : 'bottom';
      const col = r.left < vw*0.33 ? 'left' : r.left < vw*0.66 ? 'center' : 'right';
      return row === 'center' && col === 'center' ? 'center' : row+'-'+col;
    } catch { return 'unknown'; }
  }

  function substringOrTokenMatch(baseStr, candidateStr) {
    if (baseStr === candidateStr) return 1;
    if (baseStr.includes(candidateStr) || candidateStr.includes(baseStr)) return 0.5;
    const tokensA = baseStr.split(/\\s+/);
    const tokensB = candidateStr.split(/\\s+/);
    return jaccard(tokensA, tokensB);
  }

  function fingerprint(el) {
    const text = (el.textContent || el.getAttribute('placeholder') || el.getAttribute('value') || '').trim().toLowerCase();
    const tokens = text.split(/\\s+/).filter(t=>t.length>1);
    function lineage(e) {
      const c=[]; let cur=e;
      while(cur && c.length<5){c.unshift(cur.tagName.toLowerCase());cur=cur.parentElement;}
      return c;
    }
    return {
      textContent: text, textTokens: tokens,
      role: el.getAttribute('role') || el.tagName.toLowerCase(),
      ariaLabel: (el.getAttribute('aria-label')||'').toLowerCase(),
      testId: el.getAttribute('data-testid')||el.getAttribute('data-cy')||'',
      classList: Array.from(el.classList),
      tagName: el.tagName.toLowerCase(),
      lineage: lineage(el),
      spatialBucket: spatialBucket(el),
    };
  }

  function score(el) {
    const fp = fingerprint(el);
    const W = {text:0.30,role:0.10,aria:0.20,testId:0.20,class:0.10,tag:0.03,struct:0.02,spatial:0.03};

    const textScore   = jaccard(base.semanticTokens, fp.textTokens);
    const roleScore   = base.ariaRole === fp.role ? 1 : 0;
    const ariaScore   = base.ariaLabel && fp.ariaLabel ? substringOrTokenMatch(base.ariaLabel, fp.ariaLabel) : 0;
    const testIdScore = base.testId && fp.testId ? (base.testId === fp.testId ? 1 : 0.1) : 0;
    
    const baseSemClasses = semanticClasses(base.classList);
    const fpSemClasses   = semanticClasses(fp.classList);
    const classScore  = jaccard(baseSemClasses, fpSemClasses);
    
    const tagScore    = base.tag === fp.tagName ? 1 : 0;
    const lcs         = lcsLen(base.lineageVector, fp.lineage);
    const structScore = Math.max(base.lineageVector.length, fp.lineage.length) === 0 ? 0 : lcs / Math.max(base.lineageVector.length, fp.lineage.length);
    const spatialScore = base.spatialBucket && fp.spatialBucket ? (base.spatialBucket === fp.spatialBucket ? 1 : 0.3) : 0;

    const spatialPenalty = (() => {
      if (!base.spatialBucket || !fp.spatialBucket) return 0;
      const baseRow = base.spatialBucket.split('-')[0];
      const fpRow   = fp.spatialBucket.split('-')[0];
      if ((baseRow === 'bottom' && fpRow === 'top') || (baseRow === 'top' && fpRow === 'bottom')) return 0.25;
      if (baseRow !== fpRow) return 0.10;
      return 0;
    })();

    const tagPenalty = !['button','a','input','select','textarea'].includes(fp.tagName) ? 0.25 : 0;
    
    const sharesSemanticClass = baseSemClasses.some(c => fpSemClasses.includes(c));
    const identityBonus = (textScore > 0 || ariaScore > 0 || sharesSemanticClass) ? 0.08 : 0;

    const raw = textScore*W.text + roleScore*W.role + ariaScore*W.aria + testIdScore*W.testId + classScore*W.class + tagScore*W.tag + structScore*W.struct + spatialScore*W.spatial + identityBonus;

    return {
      el, score: Math.max(0, raw - tagPenalty - spatialPenalty),
      breakdown: {textScore,roleScore,ariaScore,testIdScore,classScore,tagScore,structScore,spatialScore,spatialPenalty,identityBonus},
    };
  }

  function deriveSelector(el) {
    if (el.getAttribute('data-testid')) return '[data-testid="'+el.getAttribute('data-testid')+'"]';
    if (el.getAttribute('data-cy')) return '[data-cy="'+el.getAttribute('data-cy')+'"]';
    if (el.id) return '#'+el.id;
    if (el.getAttribute('aria-label')) return '[aria-label="'+el.getAttribute('aria-label')+'"]';
    const sem = Array.from(el.classList).filter(c => !c.match(/^(flex|grid|p[xy]?-|m[xy]?-|text-|bg-|border|rounded|shadow|items-|justify-|w-|h-|font-|leading-|ring|gap-)/));
    if (sem.length) return el.tagName.toLowerCase()+'.'+sem[0];
    return el.tagName.toLowerCase();
  }

  function collect(root, results=[]) {
    const els = Array.from(root.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="link"],[tabindex]')).filter(el => !el.hasAttribute('aria-hidden') && !el.hidden);
    results.push(...els);
    for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) collect(el.shadowRoot, results); }
    return results;
  }

  const candidates = collect(document.body).slice(0, 15);
  const scored = candidates.map(score).sort((a,b) => b.score - a.score);

  if (scored.length >= 2 && (scored[0].score - scored[1].score) < 0.03) {
    scored[0].score = Math.max(0, scored[0].score - 0.10);
    scored.sort((a, b) => b.score - a.score || 0);
  }

  return scored.slice(0, 5).map(s => ({
    outerHTML: s.el.outerHTML.slice(0, 300),
    score: s.score,
    selector: deriveSelector(s.el),
    textContent: (s.el.textContent||s.el.getAttribute('placeholder')||'').trim().slice(0,80),
    tagName: s.el.tagName.toLowerCase(),
    breakdown: s.breakdown,
  }));
})
`;

const EXTRACT_FINGERPRINT_FN = `
(function(selector) {
  const el = document.querySelector(selector);
  if (!el) return null;

  function spatialBucket(el) {
    try {
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const row = r.top < vh*0.33 ? 'top' : r.top < vh*0.66 ? 'center' : 'bottom';
      const col = r.left < vw*0.33 ? 'left' : r.left < vw*0.66 ? 'center' : 'right';
      return row === 'center' && col === 'center' ? 'center' : row+'-'+col;
    } catch { return 'unknown'; }
  }

  function lineage(e) {
    const c=[]; let cur=e;
    while(cur && c.length<6){c.unshift(cur.tagName.toLowerCase());cur=cur.parentElement;}
    return c;
  }

  function inferRole(tag) {
    const m={button:'button',a:'link',input:'input',select:'listbox',textarea:'textbox'};
    return m[tag]||'generic';
  }

  const text = (el.textContent || el.getAttribute('placeholder') || el.getAttribute('value') || '').trim().toLowerCase();
  const tokens = text.split(/\\s+/).filter(t=>t.length>1);

  const dataAttrs = {};
  for (const a of el.attributes) {
    if (a.name.startsWith('data-') && a.name !== 'data-testid') {
      dataAttrs[a.name] = a.value;
    }
  }

  return {
    textContent: text, textTokens: tokens, id: el.id||'',
    role: el.getAttribute('role')||inferRole(el.tagName.toLowerCase()),
    ariaLabel: (el.getAttribute('aria-label')||'').toLowerCase(),
    testId: el.getAttribute('data-testid')||el.getAttribute('data-cy')||'',
    dataAttributes: dataAttrs, classes: Array.from(el.classList), tagName: el.tagName.toLowerCase(),
    lineage: lineage(el), depth: (() => { let d=0,c=el.parentElement; while(c){d++;c=c.parentElement;} return d; })(),
    siblingIndex: Array.from(el.parentElement?.children||[]).indexOf(el),
    siblingCount: el.parentElement?.children.length||1, spatialBucket: spatialBucket(el),
  };
})
`;

export async function safeAssert(page: Page, opts: SafeAssertOptions): Promise<void> {
  const { selector, action, verify, riskLevel = 'medium', mode = 'execute', healing = 'enabled', retryMs = 1500 } = opts;
  const cache = getCache();
  const start = Date.now();
  const locator = page.locator(selector);

  let originalFailed = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await action(locator);
      
      if (!cache.has(selector)) {
        try {
          await ensureInjected(page);
          
          const raw = await page.evaluate<RawBrowserFingerprint | null, string>(
            new Function('selector', `return (${EXTRACT_FINGERPRINT_FN})(selector)`) as any,
            selector
          );
          
          if (raw) {
            cache.set(selector, buildStoredFingerprint(selector, raw));
            cache.flush();
            printRecording(selector);
          }
        } catch (recordErr) {
          console.warn('[resilience] Recording failed (non-fatal):', recordErr);
        }
      }
      return;
    } catch (err) {
      if (!(err instanceof PlaywrightErrors.TimeoutError)) throw err;
      if (attempt < 2) await page.waitForTimeout(retryMs / 3);
      else originalFailed = true;
    }
  }

  if (healing === 'disabled') throw new Error(`[resilience] Healing disabled for "${selector}".`);
  if (DANGEROUS_TOKENS.some(t => selector.toLowerCase().includes(t)) && riskLevel !== 'critical') {
    throw new Error(`[resilience] Dangerous selector context block on: ${selector}`);
  }

  const baseline: StoredFingerprint | null = cache.get(selector);
  if (!baseline) throw new Error(`[resilience] Missing verification baseline tracking asset for: ${selector}`);

  await ensureInjected(page);
  let candidates: ScoredCandidate[] = await page.evaluate(new Function('baselineJSON', `return (${SCORE_WITH_BASELINE_FN})(baselineJSON)`) as any, JSON.stringify(baseline));

  const winner = candidates[0] || null;
  const threshold = THRESHOLDS[riskLevel];
  const urlBefore = page.url();
  let verified: boolean | undefined;
  let rolledBack = false;

  if (mode === 'suggest' || riskLevel === 'critical') {
    printRecovery(selector, candidates, winner, 'suggest', undefined, false);
    return;
  }

  if (!winner || winner.score < threshold) {
    printRecovery(selector, candidates, winner, mode, undefined, false);
    throw new Error(`[resilience] Low confidence candidate match.`);
  }

  try {
    await page.click(winner.selector, { timeout: 3000 });
  } catch {
    printRecovery(selector, candidates, winner, mode, false, false);
    throw new Error(`[resilience] Click failed.`);
  }

  if (verify) {
    try { verified = await verify(page); } catch { verified = false; }
    if (!verified) {
      await rollback(page, urlBefore);
      rolledBack = true;
      printRecovery(selector, candidates, winner, mode, false, true);
      throw new Error(`[resilience] Flow failure state context rolled back.`);
    }
  } else { verified = page.url() !== urlBefore; }

  cache.appendRecoveryEvent({
    timestamp: new Date().toISOString(), selector, recovered: true,
    selectedCandidate: winner.selector, score: winner.score, verificationPassed: verified, durationMs: Date.now() - start
  });

  printRecovery(selector, candidates, winner, mode, verified, false);
}

export const verify = {
  urlTransition(pattern: string | RegExp): VerifyFn {
    const fn = async (p: Page) => { try { await p.waitForURL(pattern, { timeout: 3000 }); return true; } catch { return false; } };
    fn.description = `URL match -> ${pattern}`; return fn;
  },
  elementVisible(selector: string): VerifyFn {
    const fn = async (p: Page) => { try { await p.waitForSelector(selector, { state: 'visible', timeout: 2000 }); return true; } catch { return false; } };
    fn.description = `Visible element -> ${selector}`; return fn;
  },
  networkRequest(urlPattern: string): VerifyFn {
    const fn = async (p: Page) => { try { await p.waitForRequest(r => r.url().includes(urlPattern), { timeout: 3000 }); return true; } catch { return false; } };
    fn.description = `Network trace endpoint target -> ${urlPattern}`; return fn;
  }
};