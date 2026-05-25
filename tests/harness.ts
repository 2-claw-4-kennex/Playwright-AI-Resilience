/**
 * harness.ts
 *
 * Ground truth evaluation simulation runtime execution wrapper.
 */

import { JSDOM } from 'jsdom';
import { failureCorpus, adversarialCorpus } from './corpus/fixtures';
import { extractFingerprint } from '../src/core/fingerprint';
import { discoverCandidates, scoreAndRank } from '../src/core/scoringEngine';

const ABSTENTION_THRESHOLD = 0.35;

interface Result {
  name: string;
  category: string;
  status: 'PASS' | 'FAIL' | 'ABSTAIN_CORRECT' | 'ABSTAIN_WRONG';
  score: number;
  gap: number;
  expected: string;
  got: string;
}

async function runHarness() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║     playwright-ai-resilience  |  Ground Truth     ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const results: Result[] = [];
  const allFixtures = [...failureCorpus, ...adversarialCorpus];

  for (const fixture of allFixtures) {
    const oldDom = new JSDOM(fixture.originalHtml);
    const targetEl = oldDom.window.document.querySelector(fixture.originalSelector);

    if (!targetEl) {
      console.error(`  Bad fixture (selector not found): ${fixture.name}`);
      continue;
    }

    const baseline = extractFingerprint(targetEl);
    const newDom = new JSDOM(fixture.mutatedHtml);
    const body = newDom.window.document.body;

    const candidates = discoverCandidates(body);
    const ranked = scoreAndRank(baseline, candidates);

    const winner = ranked[0];
    const runnerUp = ranked[1];
    const gap = winner ? (winner.score - (runnerUp?.score || 0)) : 0;

    const expectedEl = newDom.window.document.querySelector(fixture.expectedCandidateSelector);
    const pickedCorrect = winner && expectedEl && winner.element.isEqualNode(expectedEl);
    const shouldAbstain = fixture.expectAbstention ?? false;
    const willAbstain = !winner || winner.score < ABSTENTION_THRESHOLD;

    let status: Result['status'];
    if (shouldAbstain && willAbstain) {
      status = 'ABSTAIN_CORRECT';
    } else if (shouldAbstain && !willAbstain) {
      status = 'FAIL';
    } else if (!shouldAbstain && pickedCorrect) {
      status = 'PASS';
    } else {
      status = 'FAIL';
    }

    const got = winner
      ? (winner.element.getAttribute('data-testid')
        || winner.element.getAttribute('id')
        || winner.element.className
        || winner.element.tagName.toLowerCase())
      : 'no candidate';

    results.push({
      name: fixture.name,
      category: fixture.category,
      status,
      score: winner?.score || 0,
      gap,
      expected: fixture.expectedCandidateSelector,
      got,
    });

    const icon = status === 'PASS' || status === 'ABSTAIN_CORRECT' ? '✅' : '❌';
    console.log(`${icon}  ${fixture.name}  [${fixture.category}]`);
    console.log(`   Status: ${status} | Score: ${(winner?.score || 0).toFixed(3)} | Gap: ${gap.toFixed(3)}`);
    console.log();
  }

  const passed = results.filter(r => r.status === 'PASS' || r.status === 'ABSTAIN_CORRECT').length;
  const total = results.length;
  const pct = ((passed / total) * 100).toFixed(1);

  console.log('══════════════════════════════════════════════════');
  console.log(`  Recovery Rate: ${pct}%  (${passed}/${total})`);
  console.log('══════════════════════════════════════════════════\n');
}

runHarness().catch(console.error);