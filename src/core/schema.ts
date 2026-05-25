/**
 * schema.ts
 *
 * Single source of truth for the fingerprint format.
 * ALL other files import types from here.
 * Change this carefully — old baselines.json files depend on it.
 */

export const SCHEMA_VERSION = '1.0';
export const FINGERPRINT_VERSION = 'v1';

// Spatial position on viewport — coarse bucket, not pixel coords
export type SpatialBucket =
  | 'top-left' | 'top-center' | 'top-right'
  | 'center-left' | 'center' | 'center-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'
  | 'unknown';

/**
 * StoredFingerprint: the minimal element identity that survives frontend mutation.
 *
 * Design rules:
 * - No raw HTML (bloat + privacy)
 * - No computed CSS (unstable)
 * - No screenshots (size)
 * - Text is hashed, not stored raw
 */
export interface StoredFingerprint {
  // ---- Identity signals (ordered strongest → weakest) ----
  tag: string;                          // 'button', 'a', 'input' etc.
  semanticTokens: string[];            // Tokenized text: ['pay', 'now'] NOT 'Pay Now'
  textHash: string;                    // SHA-256 of normalized text (privacy-safe)
  ariaRole: string;                    // 'button', 'link', 'textbox' etc.
  ariaLabel: string;                   // Lowercased aria-label value
  testId: string;                      // data-testid / data-cy / data-e2e
  dataAttributes: Record<string, string>; // Other data-* attrs (not data-testid)
  classList: string[];                 // Semantic classes only (no Tailwind utilities)

  // ---- Structural signals ----
  lineageVector: string[];             // ['body', 'main', 'form', 'div', 'button']
  depth: number;                       // DOM depth from document root
  siblingIndex: number;               // Position among siblings
  siblingCount: number;               // Total siblings

  // ---- Spatial signal ----
  spatialBucket: SpatialBucket;       // Coarse viewport region

  // ---- Metadata ----
  fingerprintVersion: string;         // 'v1' — used to detect stale baselines
  recordedAt: number;                 // Unix timestamp
  selector: string;                   // Original selector this was recorded for
}

/**
 * BaselineFile: what gets written to .resilience/baselines.json
 */
export interface BaselineFile {
  schemaVersion: string;             // '1.0'
  generatedAt: number;               // Unix timestamp of first write
  projectRoot: string;               // Absolute path — for multi-project isolation
  entries: Record<string, StoredFingerprint>; // keyed by original selector
}

/**
 * RecoveryEvent: appended to .resilience/recovery-log.jsonl on each healing event.
 * JSONL (one JSON object per line) — safe for concurrent CI workers.
 */
export interface RecoveryEvent {
  timestamp: string;                 // ISO 8601
  selector: string;                  // Original broken selector
  recovered: boolean;
  selectedCandidate?: string;        // The selector we used instead
  score?: number;
  verificationPassed?: boolean;
  category?: string;                 // TEXT_MUTATION, CLASS_RENAME, etc.
  durationMs: number;
}