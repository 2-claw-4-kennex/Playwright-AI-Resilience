/**
 * fingerprint.ts
 *
 * Pure-function feature extraction for the local jsdom harness context.
 * Stable V1: Explicitly falls back to placeholder or value attributes for input fields.
 */

export interface Fingerprint {
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
  siblingIndex: number;
  siblingCount: number;
  depth: number;
}

export function extractFingerprint(el: Element): Fingerprint {
  const rawText = (
    el.textContent || 
    el.getAttribute('placeholder') || 
    el.getAttribute('value') || 
    ''
  ).trim().toLowerCase();

  return {
    textContent: rawText,
    textTokens: tokenize(rawText),
    id: el.id || '',
    role: el.getAttribute('role') || inferRole(el.tagName),
    ariaLabel: (el.getAttribute('aria-label') || '').toLowerCase(),
    testId: el.getAttribute('data-testid')
          || el.getAttribute('data-cy')
          || el.getAttribute('data-e2e')
          || '',
    dataAttributes: extractDataAttrs(el),
    classes: Array.from(el.classList),
    tagName: el.tagName.toLowerCase(),
    lineage: buildLineage(el),
    siblingIndex: getSiblingIndex(el),
    siblingCount: getSiblingCount(el),
    depth: getDepth(el),
  };
}

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(t => t.length > 1);
}

function inferRole(tag: string): string {
  const map: Record<string, string> = {
    button: 'button', a: 'link', input: 'input',
    select: 'listbox', textarea: 'textbox', form: 'form',
  };
  return map[tag.toLowerCase()] || 'generic';
}

function extractDataAttrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith('data-') && attr.name !== 'data-testid') {
      out[attr.name] = attr.value;
    }
  }
  return out;
}

function buildLineage(el: Element): string[] {
  const chain: string[] = [];
  let cur: Element | null = el;
  while (cur && chain.length < 4) {
    chain.unshift(cur.tagName.toLowerCase());
    cur = cur.parentElement;
  }
  return chain;
}

function getSiblingIndex(el: Element): number {
  const siblings = Array.from(el.parentElement?.children || []);
  return siblings.indexOf(el);
}

function getSiblingCount(el: Element): number {
  return el.parentElement?.children.length || 1;
}

function getDepth(el: Element): number {
  let d = 0;
  let cur: Element | null = el.parentElement;
  while (cur) { d++; cur = cur.parentElement; }
  return d;
}