/**
 * browserScript.ts
 *
 * Encapsulated browser string context logic executed via Chrome DevTools Protocol.
 */

export interface BrowserFingerprint {
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

export interface BrowserScoredCandidate {
  outerHTML: string;
  score: number;
  selector: string;
  textContent: string;
  tagName: string;
  breakdown: {
    textScore: number;
    roleScore: number;
    ariaScore: number;
    testIdScore: number;
    dataAttrScore: number;
    classScore: number;
    tagScore: number;
    structureScore: number;
    ambiguityPenalty: number;
    tagMismatchPenalty: number;
  };
}

export const BROWSER_SCRIPT = `
(function() {
  const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea']);

  const W = {
    text: 0.30, role: 0.15, aria: 0.15, testId: 0.20,
    dataAttr: 0.08, classes: 0.07, tag: 0.03, structure: 0.02
  };

  function tokenize(text) {
    return text.toLowerCase().split(/\\s+/).filter(t => t.length > 1);
  }

  function inferRole(tag) {
    const m = { button:'button', a:'link', input:'input', select:'listbox', textarea:'textbox' };
    return m[tag] || 'generic';
  }

  function extractDataAttrs(el) {
    const out = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') && attr.name !== 'data-testid') {
        out[attr.name] = attr.value;
      }
    }
    return out;
  }

  function buildLineage(el) {
    const chain = [];
    let cur = el;
    while (cur && chain.length < 4) {
      chain.unshift(cur.tagName.toLowerCase());
      cur = cur.parentElement;
    }
    return chain;
  }

  function getDepth(el) {
    let d = 0, cur = el.parentElement;
    while (cur) { d++; cur = cur.parentElement; }
    return d;
  }

  function getSiblingIndex(el) {
    return Array.from(el.parentElement?.children || []).indexOf(el);
  }

  function fingerprint(el) {
    const text = (el.textContent || '').trim().toLowerCase();
    return {
      textContent: text,
      textTokens: tokenize(text),
      id: el.id || '',
      role: el.getAttribute('role') || inferRole(el.tagName.toLowerCase()),
      ariaLabel: (el.getAttribute('aria-label') || '').toLowerCase(),
      testId: el.getAttribute('data-testid') || el.getAttribute('data-cy') || el.getAttribute('data-e2e') || '',
      dataAttributes: extractDataAttrs(el),
      classes: Array.from(el.classList),
      tagName: el.tagName.toLowerCase(),
      lineage: buildLineage(el),
      siblingIndex: getSiblingIndex(el),
      siblingCount: el.parentElement?.children.length || 1,
      depth: getDepth(el),
    };
  }

  function collectInteractive(root, results = [], depth = 0) {
    if (depth > 12) return results;
    const els = root.querySelectorAll(
      'button, a, input, select, textarea, [role="button"], [role="link"], [tabindex]'
    );
    for (const el of els) {
      if (!el.hasAttribute('aria-hidden') && !el.hidden) {
        results.push(el);
      }
    }
    const all = root.querySelectorAll('*');
    for (const el of all) {
      if (el.shadowRoot) {
        collectInteractive(el.shadowRoot, results, depth + 1);
      }
    }
    return results;
  }

  function jaccard(a, b) {
    const sa = new Set(a), sb = new Set(b);
    const inter = [...sa].filter(x => sb.has(x)).length;
    const union = new Set([...sa, ...sb]).size;
    return union === 0 ? 0 : inter / union;
  }

  function semanticClasses(classes) {
    return classes.filter(c =>
      !c.match(/^(flex|grid|p[xy]?-|m[xy]?-|text-|bg-|border|rounded|shadow|items-|justify-|w-|h-|font-|leading-|ring|gap-|space-)/)
    );
  }

  function lcsLen(a, b) {
    const dp = Array.from({length: a.length+1}, () => new Array(b.length+1).fill(0));
    for (let i=1;i<=a.length;i++)
      for (let j=1;j<=b.length;j++)
        dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1]+1 : Math.max(dp[i-1][j], dp[i][j-1]);
    return dp[a.length][b.length];
  }

  function scoreOne(base, el) {
    const fp = fingerprint(el);
    const bd = {
      textScore:   jaccard(base.textTokens, fp.textTokens),
      roleScore:   base.role === fp.role ? 1 : 0,
      ariaScore:   base.ariaLabel && fp.ariaLabel
                     ? jaccard(base.ariaLabel.split(' '), fp.ariaLabel.split(' '))
                     : 0,
      testIdScore: base.testId && fp.testId
                     ? (base.testId === fp.testId ? 1 : 0.2) : 0,
      dataAttrScore: (() => {
        const keys = Object.keys(base.dataAttributes);
        if (!keys.length) return 0;
        return keys.filter(k => fp.dataAttributes[k] === base.dataAttributes[k]).length / keys.length;
      })(),
      classScore:  jaccard(semanticClasses(base.classes), semanticClasses(fp.classes)),
      tagScore:    base.tagName === fp.tagName ? 1 : 0,
      structureScore: (() => {
        const l = lcsLen(base.lineage, fp.lineage);
        return Math.max(base.lineage.length, fp.lineage.length) === 0 ? 0
          : l / Math.max(base.lineage.length, fp.lineage.length);
      })(),
      ambiguityPenalty: 0,
      tagMismatchPenalty: !INTERACTIVE_TAGS.has(fp.tagName) ? 0.2 : 0,
    };

    const raw = bd.textScore*W.text + bd.roleScore*W.role + bd.ariaScore*W.aria
              + bd.testIdScore*W.testId + bd.dataAttrScore*W.dataAttr
              + bd.classScore*W.classes + bd.tagScore*W.tag + bd.structureScore*W.structure;

    return { el, fp, score: Math.max(0, raw - bd.tagMismatchPenalty), breakdown: bd };
  }

  function deriveSelector(el) {
    if (el.getAttribute('data-testid')) return \`[data-testid="\${el.getAttribute('data-testid')}"]\`;
    if (el.getAttribute('data-cy')) return \`[data-cy="\${el.getAttribute('data-cy')}"]\`;
    if (el.id) return \`#\${el.id}\`;
    if (el.getAttribute('aria-label')) return \`[aria-label="\${el.getAttribute('aria-label')}"]\`;
    const semanticCls = Array.from(el.classList).filter(c =>
      !c.match(/^(flex|grid|p[xy]?-|m[xy]?-|text-|bg-|border|rounded|shadow|items-|justify-|w-|h-|font-|leading-|ring|gap-|space-)/)
    );
    if (semanticCls.length) return \`\${el.tagName.toLowerCase()}.\${semanticCls[0]}\`;
    return el.tagName.toLowerCase();
  }

  window.__resilience_discover = function(baselineJSON) {
    const base = JSON.parse(baselineJSON);
    const candidates = collectInteractive(document.body).slice(0, 15);
    const scored = candidates.map(el => scoreOne(base, el));
    scored.sort((a, b) => b.score - a.score);

    if (scored.length >= 2 && (scored[0].score - scored[1].score) < 0.10) {
      scored[0].breakdown.ambiguityPenalty = 0.15;
      scored[0].score = Math.max(0, scored[0].score - 0.15);
    }

    return scored.slice(0, 5).map(s => ({
      outerHTML: s.el.outerHTML.slice(0, 300),
      score: s.score,
      selector: deriveSelector(s.el),
      textContent: s.fp.textContent,
      tagName: s.fp.tagName,
      breakdown: s.breakdown,
    }));
  };

  window.__resilience_fingerprint = function(selector) {
    const el = document.querySelector(selector);
    if (!el) return null;
    return JSON.stringify(fingerprint(el));
  };
})();
`;