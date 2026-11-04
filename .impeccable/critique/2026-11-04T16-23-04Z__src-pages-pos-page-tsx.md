---
target: POS
total_score: 26
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/Users/roncuevas/Documents/GitHub/Mauricio_ERPNext/src/pages/pos-page.tsx"
target_fingerprint: "sha256:94c0cddf1d6d1351f802a8a1ee947ebfb59d40c2b58e2faea7af985450d0153f"
target_path: /Users/roncuevas/Documents/GitHub/Mauricio_ERPNext/src/pages/pos-page.tsx
timestamp: 2026-11-04T16-23-04Z
slug: src-pages-pos-page-tsx
---
# Critique: POS
Target: src/pages/pos-page.tsx
Mode: Operate

## Design health score
26/40 — Acceptable. Significant improvement needed before users are happy.

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Loading and confirmation feedback exist; some status is not persistent. |
| 2 | Match System / Real World | 3/4 | Cashier flow is recognizable; ERPNext-specific concepts need context. |
| 3 | User Control and Freedom | 3/4 | Cart can be edited, but cancel clears it without undo. |
| 4 | Consistency and Standards | 3/4 | Shared components are used; rendered consistency could not be checked. |
| 5 | Error Prevention | 2/4 | Profile and payment constraints exist; sale cancellation is immediate. |
| 6 | Recognition Rather Than Recall | 3/4 | Labeled controls and search help; local carts and held sales need distinction. |
| 7 | Flexibility and Efficiency | 3/4 | Search, autofocus, drafts, and history help; no keyboard shortcuts found. |
| 8 | Aesthetic and Minimalist Design | 2/4 | Secondary toolbar actions compete with the sale. |
| 9 | Error Recovery | 2/4 | Error notices exist; a failed confirmation read can leave charge status ambiguous. |
| 10 | Help and Documentation | 2/4 | Opening guidance exists; contextual help for less obvious flows is missing. |

## Design specificity verdict
The flow is grounded in ERPNext POS work: profile, customer, cached products, variants, UOMs, payments, shifts, local carts, and drafts. Its structure fits cashiers, though the toolbar still presents several secondary tasks with similar prominence.

Deterministic scan: the markup detector returned [] (zero findings) for src/pages/pos-page.tsx. This does not assess visual hierarchy or payment edge cases.

Visual evidence: the browser host failed with “The browser access host is unavailable” on fresh-tab attempts. DOM inspection, mutation preflight, overlay injection, and console inspection could not run. No user-visible overlay is available.

## Overall impression
The POS has a coherent operational foundation. The biggest risks are accidental loss of the current cart and ambiguity if the sale is submitted but its confirmation read fails.

## What's working
- Profile, customer, product, cart, and payment tasks share one workspace.
- Variants, UOMs, local carts, and ERPNext drafts have dedicated flows.
- Loading, error, and sale confirmation states exist; compact layouts have product/cart tabs.

## Priority issues
1. **[P1] Cancel sale discards the current cart without confirmation or undo.** The action clears lines and payments immediately. An accidental tap during a busy checkout can lose work. Add confirmation or a short recovery action. Suggested command: $impeccable harden.
2. **[P1] A confirmation read failure after submission leaves an ambiguous charge result.** submitSale submits the document and then reads its status. If that read fails, the cart stays and retry may create a new invoice. Distinguish failed submission from accepted-but-unconfirmed, then prevent retry until resolved. Suggested command: $impeccable harden.
3. **[P2] Secondary actions compete with the sale flow.** History, held sales, local carts, and quotations compete with checkout. Keep frequent actions visible and group the rest. Suggested command: $impeccable distill.
4. **[P2] Held sales and local carts have unclear distinction.** They use different persistence scopes. Explain destination and scope at their entry points. Suggested command: $impeccable clarify.

## Persona red flags
- Hurried cashier: may clear work accidentally or retry a charge whose status is unknown.
- New cashier: may confuse ERPNext held sales with locally saved carts.
- Keyboard-focused cashier: product search supports autofocus, but no shortcuts for cart/payment actions were evident.

## Minor observations
Opening-fund fields can become a long form for profiles with many payment methods. Visual density and touch target sizes could not be checked in the browser.

## Questions to consider
- Which actions need to remain visible during every sale?
- Should Cancel sale be able to discard work without a recovery path?
- Can cashiers immediately tell whether a cart is local, held in ERPNext, or ready to charge?
