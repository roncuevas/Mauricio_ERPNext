---
target: Critique product creation and pricing flow; simpler and advanced options plus post-create price action
total_score: 19
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:/Users/roncuevas/Documents/GitHub/Mauricio_ERPNext/src/pages/editors.tsx"
target_fingerprint: "sha256:db8638ceaeee5ddc943be59f0e128644fb7125004a6f482864a88c227624ad9a"
target_path: /Users/roncuevas/Documents/GitHub/Mauricio_ERPNext/src/pages/editors.tsx
timestamp: 2026-11-06T21-54-54Z
slug: src-pages-editors-tsx
---
Method: dual-agent (A: ux_assessment · B: evidence_assessment)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2/4 | Save returns to catalog without confirmation or next step. |
| 2 | Match System / Real World | 2/4 | Editor exposes ERPNext metadata fields, some technical. |
| 3 | User Control and Freedom | 2/4 | No basic versus advanced choice. |
| 4 | Consistency and Standards | 3/4 | Shared controls; product and price remain separate flows. |
| 5 | Error Prevention | 2/4 | Generic form exposes irrelevant fields; price editor does catch duplicates and deviations. |
| 6 | Recognition Rather Than Recall | 2/4 | Users must know needed fields and where pricing lives. |
| 7 | Flexibility and Efficiency | 2/4 | No fast path or direct post-create price action. |
| 8 | Aesthetic and Minimalist Design | 1/4 | Every available Item field appears in the form. |
| 9 | Error Recovery | 2/4 | Errors and save state exist; success gives no orientation. |
| 10 | Help and Documentation | 1/4 | No guidance on essential fields or pricing next step. |
| **Total** | | **19/40** | **Needs attention** |

## Design Specificity Verdict

**LLM assessment:** The screen feels like a generic ERPNext administrative form. It respects configurable metadata but does not guide everyday product creation and optional pricing.

**Deterministic scan:** 0 findings in `src/pages/editors.tsx`. The UX review found workflow issues beyond static scan coverage. No false positives reported.

**Visual evidence:** Browser host returned `The browser access host is unavailable`; no screenshot or overlay. Findings use source and two independent assessments.

## Overall Impression

The functional pieces exist: metadata-driven creation and a price editor with useful safeguards. Main opportunity: focused basic creation, optional advanced details, and a clear offer to add price after saving.

## What's Working

- Uses ERPNext metadata, including instance-specific fields.
- Shows required fields, errors, and saving state.
- Price editor helps prevent duplicates and flags unusual amounts.

## Priority Issues

1. **[P1] Initial form is too broad.** Every DocType field appears, forcing store staff to decide what matters. Add a basic mode with essential fields and a “Datos avanzados” path. **Suggested command:** `$impeccable shape`.
2. **[P1] Pricing is not a next step.** Save ends at the catalog; users may think the product is ready to sell. Show “Agregar precio” and “Listo”; keep pricing optional. **Suggested command:** `$impeccable shape`.
3. **[P1] Save has no clear confirmation.** Immediate close does not confirm which product was created. Confirm its name and focus the next action. **Suggested command:** `$impeccable clarify`.
4. **[P2] Field order and language inherit DocType structure.** Administrative sections can confuse. Group basic fields by task and keep the advanced path visible. **Suggested command:** `$impeccable distill`.
5. **[P2] No direct path to price later.** Add “Agregar precio” to products without a selling price. **Suggested command:** `$impeccable shape`.

## Persona Red Flags

- **Jordan, first-timer:** broad form gives no clue which fields make a usable product; catalog does not explain how to price it.
- **Alex, power user:** no short path for basic creation and pricing; explicit advanced mode can preserve depth.
- **Sam, keyboard or screen-reader user:** fields are labeled, but save success and useful focus placement are missing.

## Minor Observations

Field count and meaning depend on ERPNext metadata. Review instance metadata before choosing basic fields. A price shortcut should prefill the product and show type, list, UOM, and currency.

## Questions to Consider

- Which fields must staff fill to create a valid product in this ERPNext instance?
- Should “Agregar precio” be offered after save, or should users set one during creation?
- What means “ready to sell”: saved Item, active selling price, or both?
