/**
 * baselineCache.ts
 *
 * Reads and writes .resilience/baselines.json in the project root.
 * This is the "memory" that makes recovery possible.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  BaselineFile,
  StoredFingerprint,
  RecoveryEvent,
  SCHEMA_VERSION,
  FINGERPRINT_VERSION,
} from './schema';

function resilienceDir(projectRoot: string): string {
  return path.join(projectRoot, '.resilience');
}

function baselinesPath(projectRoot: string): string {
  return path.join(resilienceDir(projectRoot), 'baselines.json');
}

function recoveryLogPath(projectRoot: string): string {
  return path.join(resilienceDir(projectRoot), 'recovery-log.jsonl');
}

export class BaselineCache {
  private projectRoot: string;
  private data: BaselineFile;
  private dirty = false;

  constructor(projectRoot?: string) {
    this.projectRoot = projectRoot || findProjectRoot(process.cwd());
    this.data = this.load();
  }

  get(selector: string): StoredFingerprint | null {
    const entry = this.data.entries[selector];
    if (!entry) return null;

    if (entry.fingerprintVersion !== FINGERPRINT_VERSION) {
      console.warn(
        `[resilience] Baseline for "${selector}" uses old fingerprint version `
        + `(${entry.fingerprintVersion}). Re-recording on next green run.`
      );
      delete this.data.entries[selector];
      this.dirty = true;
      return null;
    }

    return entry;
  }

  has(selector: string): boolean {
    return this.get(selector) !== null;
  }

  set(selector: string, fingerprint: StoredFingerprint): void {
    this.data.entries[selector] = fingerprint;
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    const dir = resilienceDir(this.projectRoot);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      baselinesPath(this.projectRoot),
      JSON.stringify(this.data, null, 2),
      'utf8'
    );
    this.dirty = false;
  }

  appendRecoveryEvent(event: RecoveryEvent): void {
    const dir = resilienceDir(this.projectRoot);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      recoveryLogPath(this.projectRoot),
      JSON.stringify(event) + '\n',
      'utf8'
    );
  }

  private load(): BaselineFile {
    const p = baselinesPath(this.projectRoot);
    if (!fs.existsSync(p)) {
      return {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: Date.now(),
        projectRoot: this.projectRoot,
        entries: {},
      };
    }
    try {
      const raw = fs.readFileSync(p, 'utf8');
      const parsed = JSON.parse(raw) as BaselineFile;

      if (parsed.schemaVersion !== SCHEMA_VERSION) {
        console.warn(
          `[resilience] baselines.json schema version mismatch `
          + `(file: ${parsed.schemaVersion}, current: ${SCHEMA_VERSION}). `
          + `Baselines will be regenerated.`
        );
        return {
          schemaVersion: SCHEMA_VERSION,
          generatedAt: Date.now(),
          projectRoot: this.projectRoot,
          entries: {},
        };
      }
      return parsed;
    } catch {
      console.warn('[resilience] Failed to parse baselines.json — starting fresh.');
      return {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: Date.now(),
        projectRoot: this.projectRoot,
        entries: {},
      };
    }
  }

  stats(): { total: number; oldest: number | null; newest: number | null } {
    const entries = Object.values(this.data.entries);
    if (!entries.length) return { total: 0, oldest: null, newest: null };
    const times = entries.map(e => e.recordedAt);
    return {
      total: entries.length,
      oldest: Math.min(...times),
      newest: Math.max(...times),
    };
  }

  listSelectors(): string[] {
    return Object.keys(this.data.entries);
  }

  delete(selector: string): void {
    delete this.data.entries[selector];
    this.dirty = true;
    this.flush();
  }
}

export function buildStoredFingerprint(
  selector: string,
  browserData: RawBrowserFingerprint
): StoredFingerprint {
  return {
    selector,
    tag: browserData.tagName,
    semanticTokens: browserData.textTokens,
    textHash: hashText(browserData.textContent),
    ariaRole: browserData.role,
    ariaLabel: browserData.ariaLabel,
    testId: browserData.testId,
    dataAttributes: browserData.dataAttributes,
    classList: semanticClassesOnly(browserData.classes),
    lineageVector: browserData.lineage,
    depth: browserData.depth,
    siblingIndex: browserData.siblingIndex,
    siblingCount: browserData.siblingCount,
    spatialBucket: browserData.spatialBucket,
    fingerprintVersion: FINGERPRINT_VERSION,
    recordedAt: Date.now(),
  };
}

export interface RawBrowserFingerprint {
  textContent: string;
  textTokens: string[];
  id: string;
  role: string;
  ariaLabel: string;
  testId: string;
  dataAttributes: Record<string, string>;
  classes: string[];
  tagName: string;
  lineage: string[];
  depth: number;
  siblingIndex: number;
  siblingCount: number;
  spatialBucket: SpatialBucket;
}

function hashText(text: string): string {
  return crypto
    .createHash('sha256')
    .update(text.trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

function semanticClassesOnly(classes: string[]): string[] {
  return classes.filter(c =>
    !c.match(/^(flex|grid|p[xy]?-|m[xy]?-|text-|bg-|border|rounded|shadow|items-|justify-|w-|h-|font-|leading-|ring|gap-|space-|hover:|focus:|active:|sm:|md:|lg:|xl:)/)
  );
}

function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

import type { SpatialBucket } from './schema';