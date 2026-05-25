/**
 * scoringEngine.ts
 *
 * Local deterministic ranking engine used to back test-driven harness evaluation.
 * V1.1: Synced weights with browser, added aria-hidden ancestor traversal.
 */

import { Fingerprint, extractFingerprint } from './fingerprint';

export interface ScoredCandidate {
  element: Element;
  fingerprint: Fingerprint;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  textScore: number;
  roleScore: number;
  ariaScore: number;
  testIdScore: number;
  dataAttrScore: number;
  classScore: number;
  tagScore: number;
  structureScore: number;
  spatialScore: number;
  spatialPenalty: number;
  ambiguityPenalty: number;
  tagMismatchPenalty: number;
  identityBonus: number;
}

// EXACT SYNC WITH safeAssert.ts
const W = {
  text:      0.30,      
  role:      0.10,
  aria:      0.20,      
  testId:    0.20,
  dataAttr:  0.05,
  classes:   0.10,
  tag:       0.03,
  structure: 0.02,
  spatial:   0.03
};

const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea']);

export function discoverCandidates(root: Element): Element[] {
  const all = Array.from(root.querySelectorAll(
    'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]'
  ));

  return all
    .filter(el => !isHidden(el))
    .slice(0, 15);
}

export function scoreAndRank(
  baseline: Fingerprint,
  candidates: Element[]
): ScoredCandidate[] {
  const scored = candidates.map(el => scoreOne(baseline, el));

  scored.sort((a, b) => b.score - a.score || 0);

  if (scored.length >= 2) {
    const gap = scored[0].score - scored[1].score;
    if (gap < 0.03) {
      scored[0].breakdown.ambiguityPenalty = 0.10;
      scored[0].score = Math.max(0, scored[0].score - 0.10);
      scored.sort((a, b) => b.score - a.score || 0);
    }
  }

  return scored;
}

function scoreOne(base: Fingerprint, el: Element): ScoredCandidate {
  const fp = extractFingerprint(el);
  
  const semanticBaseClasses = semanticClasses(base.classes);
  const semanticFpClasses = semanticClasses(fp.classes);

  const spatialScore = base.spatialBucket && fp.spatialBucket && base.spatialBucket !== 'unknown' && fp.spatialBucket !== 'unknown' 
    ? (base.spatialBucket === fp.spatialBucket ? 1 : 0.3) 
    : 0;

  const spatialPenalty = (() => {
    if (!base.spatialBucket || !fp.spatialBucket || base.spatialBucket === 'unknown' || fp.spatialBucket === 'unknown') return 0;
    const baseRow = base.spatialBucket.split('-')[0];
    const fpRow   = fp.spatialBucket.split('-')[0];
    if ((baseRow === 'bottom' && fpRow === 'top') || (baseRow === 'top' && fpRow === 'bottom')) return 0.25;
    if (baseRow !== fpRow) return 0.10;
    return 0;
  })();

  const b: ScoreBreakdown = {
    textScore:        textSimilarity(base.textTokens, fp.textTokens),
    roleScore:        base.role === fp.role ? 1 : 0,
    ariaScore:        base.ariaLabel && fp.ariaLabel
                        ? substringOrTokenMatch(base.ariaLabel, fp.ariaLabel)
                        : 0,
    testIdScore:      base.testId && fp.testId
                        ? (base.testId === fp.testId ? 1 : 0.1)
                        : 0,
    dataAttrScore:    dataAttrOverlap(base.dataAttributes, fp.dataAttributes),
    classScore:       jaccardSimilarity(semanticBaseClasses, semanticFpClasses),
    tagScore:         base.tagName === fp.tagName ? 1 : 0,
    structureScore:   lineageSimilarity(base.lineage, fp.lineage),
    spatialScore:     spatialScore,
    spatialPenalty:   spatialPenalty,
    ambiguityPenalty: 0,
    tagMismatchPenalty: !INTERACTIVE_TAGS.has(fp.tagName) ? 0.25 : 0,
    identityBonus:    0,
  };

  const sharesSemanticClass = [...semanticBaseClasses].some(c => semanticFpClasses.has(c));
  b.identityBonus = (b.textScore > 0 || b.ariaScore > 0 || sharesSemanticClass) ? 0.08 : 0;

  const raw =
    b.textScore      * W.text +
    b.roleScore      * W.role +
    b.ariaScore      * W.aria +
    b.testIdScore    * W.testId +
    b.dataAttrScore  * W.dataAttr +
    b.classScore     * W.classes +
    b.tagScore       * W.tag +
    b.structureScore * W.structure +
    b.spatialScore   * W.spatial +
    b.identityBonus;

  const score = Math.max(0, raw - b.tagMismatchPenalty - b.spatialPenalty);

  return { element: el, fingerprint: fp, score, breakdown: b };
}

function substringOrTokenMatch(baseStr: string, candidateStr: string): number {
  if (baseStr === candidateStr) return 1;
  if (baseStr.includes(candidateStr) || candidateStr.includes(baseStr)) return 0.5;
  const tokensA = baseStr.split(/\s+/);
  const tokensB = candidateStr.split(/\s+/);
  return textSimilarity(tokensA, tokensB);
}

function textSimilarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(t => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  const intersection = [...a].filter(t => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function semanticClasses(classes: string[]): Set<string> {
  return new Set(classes.filter(c =>
    !c.match(/^(flex|grid|p[xy]?-|m[xy]?-|text-|bg-|border|rounded|shadow|items-|justify-|w-|h-|font-|leading-|ring|gap-|space-|hover:|focus:|active:|sm:|md:|lg:|xl:)/)
  ));
}

function dataAttrOverlap(a: Record<string, string>, b: Record<string, string>): number {
  const keysA = Object.keys(a);
  if (!keysA.length) return 0;
  const matches = keysA.filter(k => b[k] === a[k]).length;
  return matches / keysA.length;
}

function lineageSimilarity(a: string[], b: string[]): number {
  const lcs = lcsLength(a, b);
  return Math.max(a.length, b.length) === 0 ? 0 : lcs / Math.max(a.length, b.length);
}

function lcsLength(a: string[], b: string[]): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length].length === 0 ? 0 : dp[a.length][b.length];
}

// BUG FIX: Now checks ancestors for aria-hidden="true" via closest()
function isHidden(el: Element): boolean {
  return !!el.closest('[aria-hidden="true"]') || (el as HTMLElement).hidden === true;
}