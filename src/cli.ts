#!/usr/bin/env ts-node
/**
 * cli.ts
 *
 * Administrative engine operations endpoint.
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { BaselineCache } from './core/baselineCache';
import { RecoveryEvent } from './core/schema';

const cmd = process.argv[2];
const arg = process.argv[3];

const cache = new BaselineCache();

switch (cmd) {
  case 'status': {
    const s = cache.stats();
    console.log(chalk.cyan('\n  playwright-ai-resilience — Baseline Status'));
    console.log('  ─────────────────────────────────────────');
    console.log(`  Entries recorded:  ${chalk.green(s.total)}`);
    if (s.oldest) console.log(`  Oldest baseline:   ${new Date(s.oldest).toLocaleString()}`);
    if (s.newest) console.log(`  Newest baseline:   ${new Date(s.newest).toLocaleString()}`);
    console.log(`  Storage:           .resilience/baselines.json`);
    console.log();
    break;
  }

  case 'list': {
    const selectors = cache.listSelectors();
    if (!selectors.length) {
      console.log(chalk.yellow('\n  No baselines recorded yet. Run your tests on a green build first.\n'));
      break;
    }
    console.log(chalk.cyan('\n  Recorded baselines:'));
    selectors.forEach(s => console.log(`  • ${chalk.yellow(s)}`));
    console.log();
    break;
  }

  case 'clear': {
    if (!arg) {
      console.error(chalk.red('  Usage: resilience clear <selector>'));
      process.exit(1);
    }
    cache.delete(arg);
    console.log(chalk.green(`  ✓ Cleared baseline for: ${arg}\n`));
    break;
  }

  case 'clear-all': {
    const selectors = cache.listSelectors();
    selectors.forEach(s => cache.delete(s));
    console.log(chalk.green(`  ✓ Cleared ${selectors.length} baselines.\n`));
    break;
  }

  case 'log': {
    const logPath = path.join(process.cwd(), '.resilience', 'recovery-log.jsonl');
    if (!fs.existsSync(logPath)) {
      console.log(chalk.yellow('\n  No recovery events logged yet.\n'));
      break;
    }
    const lines = fs.readFileSync(logPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l) as RecoveryEvent)
      .slice(-20);

    console.log(chalk.cyan('\n  Recovery Log (last 20 events):'));
    console.log('  ─────────────────────────────────────────');
    lines.forEach(e => {
      const icon = e.recovered && e.verificationPassed ? chalk.green('✓') : chalk.red('✖');
      const score = e.score ? `score=${e.score.toFixed(3)}` : '';
      const dur = `${e.durationMs}ms`;
      console.log(`  ${icon}  ${chalk.gray(e.timestamp.slice(0, 19))}  ${chalk.yellow(e.selector)}`);
      if (e.selectedCandidate) {
        console.log(`     → ${chalk.cyan(e.selectedCandidate)}  ${score}  ${dur}`);
      }
    });
    console.log();
    break;
  }

  default: {
    console.log(chalk.cyan('\n  playwright-ai-resilience CLI'));
    console.log('  ──────────────────────────────');
    console.log('  status      Show baseline stats');
    console.log('  list        List all recorded selectors');
    console.log('  clear <s>   Delete baseline for selector');
    console.log('  clear-all   Delete all baselines');
    console.log('  log         Show last 20 recovery events');
    console.log();
  }
}