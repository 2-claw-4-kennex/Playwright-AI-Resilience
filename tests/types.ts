/**
 * types.ts
 *
 * Test harness specific shared definitions.
 */

export interface BreakageFixture {
  name: string;
  category: 'TEXT_MUTATION' | 'CLASS_RENAME' | 'DOM_RESTRUCTURE' | 'ARIA_CHANGE' | 'ATTR_SHIFT';
  originalHtml: string;
  originalSelector: string;
  mutatedHtml: string;
  expectedCandidateSelector: string;
  expectAbstention?: boolean;
}