/**
 * index.ts
 *
 * Clean public API exports layout interface boundary layer.
 */

export { safeAssert, verify } from './core/safeAssert';
export type {
  SafeAssertOptions,
  VerifyFn,
  RiskLevel,
  Mode,
  ScoredCandidate,
} from './core/safeAssert';

export type {
  StoredFingerprint,
  BaselineFile,
  RecoveryEvent,
} from './core/schema';