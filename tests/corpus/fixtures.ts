/**
 * fixtures.ts
 *
 * Ground truth execution evaluation data corpus.
 */

import { BreakageFixture } from '../types';

export const failureCorpus: BreakageFixture[] = [
  {
    name: "Tailwind Class Refactor",
    category: "CLASS_RENAME",
    originalHtml: `
      <div class="cart-container">
        <button id="checkout-btn" class="btn btn-primary large-cta">Pay Now</button>
      </div>`,
    originalSelector: "#checkout-btn",
    mutatedHtml: `
      <div class="cart-container">
        <button data-testid="checkout-submit"
          class="flex items-center justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white">
          Pay Now
        </button>
        <button class="text-sm text-gray-500">Cancel</button>
      </div>`,
    expectedCandidateSelector: "[data-testid='checkout-submit']",
  },
  {
    name: "Div Soup Restructure",
    category: "DOM_RESTRUCTURE",
    originalHtml: `
      <main>
        <button class="submit-action" data-action="submit">Complete Order</button>
      </main>`,
    originalSelector: ".submit-action",
    mutatedHtml: `
      <main>
        <div class="tooltip-wrapper">
          <div class="tooltip-trigger">
            <button class="submit-action" data-action="submit">Complete Secure Order</button>
          </div>
        </div>
        <button class="secondary-action">Go Back</button>
      </main>`,
    expectedCandidateSelector: "button[data-action='submit']",
  },
  {
    name: "ARIA Label Change",
    category: "ARIA_CHANGE",
    originalHtml: `
      <nav>
        <button aria-label="open settings menu" class="icon-btn">⚙</button>
        <button aria-label="notifications" class="icon-btn">🔔</button>
      </nav>`,
    originalSelector: "[aria-label='open settings menu']",
    mutatedHtml: `
      <nav>
        <button aria-label="settings" class="icon-btn" data-testid="nav-settings">⚙</button>
        <button aria-label="alerts" class="icon-btn">🔔</button>
      </nav>`,
    expectedCandidateSelector: "[data-testid='nav-settings']",
  },
  {
    name: "Text Content Rename",
    category: "TEXT_MUTATION",
    originalHtml: `
      <footer>
        <button class="cta-primary">Get Started</button>
        <button class="cta-secondary">Learn More</button>
      </footer>`,
    originalSelector: ".cta-primary",
    mutatedHtml: `
      <footer>
        <button class="cta-primary">Start Free Trial</button>
        <button class="cta-secondary">See Plans</button>
      </footer>`,
    expectedCandidateSelector: ".cta-primary",
  },
  {
    name: "ID Removed, data-testid Added",
    category: "ATTR_SHIFT",
    originalHtml: `
      <form>
        <input id="email-field" type="email" placeholder="Enter email" />
        <input id="password-field" type="password" placeholder="Password" />
      </form>`,
    originalSelector: "#email-field",
    mutatedHtml: `
      <form>
        <input data-testid="login-email" type="email" placeholder="Your email address" />
        <input data-testid="login-password" type="password" placeholder="Your password" />
      </form>`,
    expectedCandidateSelector: "[data-testid='login-email']",
  },
  {
    name: "Button Promoted to Link",
    category: "DOM_RESTRUCTURE",
    originalHtml: `
      <div class="nav-actions">
        <button class="nav-dashboard" role="button">Dashboard</button>
        <button class="nav-profile">Profile</button>
      </div>`,
    originalSelector: ".nav-dashboard",
    mutatedHtml: `
      <div class="nav-actions">
        <a href="/dashboard" class="nav-dashboard nav-link">Dashboard</a>
        <a href="/profile" class="nav-profile nav-link">Profile</a>
      </div>`,
    expectedCandidateSelector: "a.nav-dashboard",
  },
  {
    name: "Ghost Element (True Deletion — should abstain)",
    category: "DOM_RESTRUCTURE",
    originalHtml: `
      <div class="toolbar">
        <button id="export-csv">Export CSV</button>
        <button id="export-pdf">Export PDF</button>
      </div>`,
    originalSelector: "#export-csv",
    mutatedHtml: `
      <div class="toolbar">
        <button id="export-pdf">Export PDF</button>
      </div>`,
    expectedCandidateSelector: "#export-pdf",
    expectAbstention: true,
  },
  {
    name: "Semantic Class Kept Through Tailwind Migration",
    category: "CLASS_RENAME",
    originalHtml: `
      <div class="modal-footer">
        <button class="btn-confirm action-primary">Confirm</button>
        <button class="btn-cancel">Cancel</button>
      </div>`,
    originalSelector: ".btn-confirm",
    mutatedHtml: `
      <div class="modal-footer">
        <button class="btn-confirm flex rounded bg-green-600 px-4 py-2 text-white">Confirm Changes</button>
        <button class="btn-cancel flex rounded bg-gray-200 px-4 py-2">Cancel</button>
      </div>`,
    expectedCandidateSelector: ".btn-confirm",
  },
];

export const adversarialCorpus: BreakageFixture[] = [
  {
    name: "Two Similar Buttons (Ambiguity Test)",
    category: "TEXT_MUTATION",
    originalHtml: `
      <div>
        <button class="btn-primary" data-action="confirm">Confirm Purchase</button>
        <button class="btn-secondary" data-action="review">Review Order</button>
      </div>`,
    originalSelector: "[data-action='confirm']",
    mutatedHtml: `
      <div>
        <button class="btn-primary" data-action="confirm-order">Confirm Your Purchase</button>
        <button class="btn-secondary" data-action="review-order">Review Your Order</button>
      </div>`,
    expectedCandidateSelector: "[data-action='confirm-order']",
  },
  {
    name: "Wrong Tag, Same Text (False Positive Trap)",
    category: "DOM_RESTRUCTURE",
    originalHtml: `
      <div>
        <button id="save-btn">Save</button>
      </div>`,
    originalSelector: "#save-btn",
    mutatedHtml: `
      <div>
        <span class="save-label">Save</span>
        <button id="save-btn-v2">Save</button>
      </div>`,
    expectedCandidateSelector: "#save-btn-v2",
  },
  {
    name: "Dynamic Cart Sticky Summary (Context Spill)",
    category: "TEXT_MUTATION",
    originalHtml: `
      <div class="desktop-layout">
        <div class="cart-summary-panel">
          <button id="checkout-cta" class="btn btn-success checkout-flow-trigger">Proceed to Checkout</button>
        </div>
      </div>
      <div class="mobile-drawer" aria-hidden="true">
        <button class="btn btn-success checkout-flow-trigger">Proceed to Checkout</button>
      </div>`,
    originalSelector: "#checkout-cta",
    mutatedHtml: `
      <div class="mobile-drawer" aria-hidden="true">
        <button class="btn btn-success checkout-flow-trigger">Proceed (1 Item)</button>
      </div>
      <div class="desktop-layout">
        <div class="cart-summary-panel-v2 sticky-bottom">
          <button data-testid="desktop-checkout" class="checkout-flow-trigger modern-cta-style">
            Proceed ($140.00)
          </button>
        </div>
      </div>`,
    expectedCandidateSelector: "[data-testid='desktop-checkout']",
  },
  {
    name: "Asynchronous Loading Button Spinner State (Text Disappearance Trap)",
    category: "TEXT_MUTATION",
    originalHtml: `
      <div class="panel-actions">
        <button id="save-settings-btn" class="save-trigger-cta">Save Configurations</button>
      </div>`,
    originalSelector: "#save-settings-btn",
    mutatedHtml: `
      <div class="panel-actions">
        <button data-testid="async-save-active" class="save-trigger-cta processing-state-active" disabled>
          <svg class="spinner-icon">...</svg>
          <span class="screen-reader-only">Loading Data...</span>
        </button>
        <button class="fallback-abort-cta">Cancel</button>
      </div>`,
    expectedCandidateSelector: "[data-testid='async-save-active']",
  },
  {
    name: "Deep Nested Interactive SVG Blueprint (Lineage & Tag Collapse)",
    category: "DOM_RESTRUCTURE",
    originalHtml: `
      <div class="interactive-graph-node">
        <button id="graph-delete-action">
          <span class="icon-wrapper"><i class="trash-glyph"></i></span>
          <span class="text-label">Remove Node</span>
        </button>
      </div>`,
    originalSelector: "#graph-delete-action",
    mutatedHtml: `
      <div class="interactive-graph-node-v2">
        <svg data-testid="svg-trash-trigger" role="button" aria-label="Remove Node" class="node-action-icon-trash">
          <path d="M10 20..."></path>
        </svg>
        <svg role="button" aria-label="Add Node"><path d="..."></path></svg>
      </div>`,
    expectedCandidateSelector: "[data-testid='svg-trash-trigger']",
  },
  {
    name: "SaaS Multi-Tenant Prefixed Data Attributes (Dynamic Namespace Shift)",
    category: "ATTR_SHIFT",
    originalHtml: `
      <div class="workspace-card">
        <button id="archive-project-trigger" data-legacy-action="archive-v1" data-legacy-scope="global">
          Archive Workspace
        </button>
      </div>`,
    originalSelector: "#archive-project-trigger",
    mutatedHtml: `
      <div class="workspace-card">
        <button data-testid="workspace-archive-cta" data-nextgen-action="archive-v1" data-nextgen-scope="global" class="btn">
          Archive Workspace
        </button>
      </div>`,
    expectedCandidateSelector: "[data-testid='workspace-archive-cta']",
  },
  {
    name: "Nested Billing Form Rewrite (Lineage Drift)",
    category: "DOM_RESTRUCTURE",
    originalHtml: `
      <form id="payment-form">
        <div class="form-group">
          <label>Billing Zip</label>
          <input id="billing-zip" type="text" placeholder="Zip Code" class="form-control" />
        </div>
      </form>`,
    originalSelector: "#billing-zip",
    mutatedHtml: `
      <form id="payment-form">
        <div class="form-row-fluid validation-hydrated">
          <div class="col-md-6 field-context-billing">
            <div class="input-icon-group icon-right">
              <input data-testid="postal-code-input" type="text" placeholder="Postal Code" class="form-control unique-input-token" />
            </div>
          </div>
        </div>
      </form>`,
    expectedCandidateSelector: "[data-testid='postal-code-input']",
  }
];

export const v2RoadmapCorpus: BreakageFixture[] = [
  {
    name: "Decoupled Custom Label Component (ARIA Relationship Broken)",
    category: "ARIA_CHANGE",
    originalHtml: `
      <div class="form-row">
        <label id="username-lbl" for="usr-input-field">Account Login</label>
        <input id="usr-input-field" type="text" aria-labelledby="username-lbl" />
      </div>`,
    originalSelector: "[aria-labelledby='username-lbl']",
    mutatedHtml: `
      <div class="form-row-modernized">
        <div id="new-abstract-label-id" class="custom-label-component">Account Login</div>
        <input data-testid="login-user-input" type="text" aria-labelledby="new-abstract-label-id" placeholder="Account Login" />
        <input type="text" placeholder="Unrelated Field" />
      </div>`,
    expectedCandidateSelector: "[data-testid='login-user-input']",
  },
  {
    name: "Identical Row Action Menu Placements (Ambiguity Boundary Stress Test)",
    category: "TEXT_MUTATION",
    originalHtml: `
      <div class="data-table">
        <div class="row-item" data-row-id="101">
          <span class="user-name">Alice</span>
          <button class="row-action-trigger edit-action-btn">Modify Record</button>
        </div>
        <div class="row-item" data-row-id="102">
          <span class="user-name">Bob</span>
          <button class="row-action-trigger edit-action-btn">Modify Record</button>
        </div>
      </div>`,
    originalSelector: ".data-table .row-item[data-row-id='101'] .edit-action-btn",
    mutatedHtml: `
      <div class="data-table-optimized-virtual-list">
        <div class="virtual-row-wrapper" data-identity-token="usr-alice">
          <div class="cell-data">Alice</div>
          <button data-testid="action-btn-alice" class="edit-action-btn custom-interactive-layout-trigger">
            Update Profile
          </button>
        </div>
        <div class="virtual-row-wrapper" data-identity-token="usr-bob">
          <div class="cell-data">Bob</div>
          <button data-testid="action-btn-bob" class="edit-action-btn custom-interactive-layout-trigger">
            Update Profile
          </button>
        </div>
      </div>`,
    expectedCandidateSelector: "[data-testid='action-btn-alice']",
  }
];