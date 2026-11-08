---
target: Catalog price cards look visually fragmented and dense
total_score: 24
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/Users/roncuevas/Documents/GitHub/Mauricio_ERPNext/src/pages/prices-page.tsx"
target_fingerprint: "sha256:492e413581e57e25618466dcc6f6a4ce08576ecf120b524b014245fc81344092"
target_path: /Users/roncuevas/Documents/GitHub/Mauricio_ERPNext/src/pages/prices-page.tsx
timestamp: 2026-11-08T01-09-44Z
slug: src-pages-prices-page-tsx
---
Method: dual-agent (A: ux_assessment · B: detector_assessment)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Type and amount are visible, but secondary data compete with them. |
| 2 | Match System / Real World | 3/4 | Buying/selling, UOM, and price list are concrete catalog concepts. |
| 3 | User Control and Freedom | 3/4 | Users can select and edit each price. |
| 4 | Consistency and Standards | 2/4 | Selection and editing sit in separate areas of the card. |
| 5 | Error Prevention | 2/4 | The card does not quickly connect the amount to its list or supplier. |
| 6 | Recognition Rather Than Recall | 3/4 | The data are present, but spread across rows. |
| 7 | Flexibility and Efficiency | 3/4 | Direct actions and bulk selection are available. |
| 8 | Aesthetic and Minimalist Design | 1/4 | Each compact card combines actions, metadata, and margin. |
| 9 | Error Recovery | 2/4 | No recovery issue is apparent in this view. |
| 10 | Help and Documentation | 2/4 | ERP users know the terms, but the visual hierarchy provides little guidance. |
| **Total** | | **24/40** | **Acceptable; visual density is the main issue.** |

## Design Specificity Verdict

The item and variant hierarchy fits ERPNext. The price card does not make the first thing to scan clear: “Seleccionar” sits above, Buying and the amount occupy another row, and “Editar” is separated. The card feels tall and fragmented despite available horizontal space.

The deterministic scan returned `[]` (0 findings). That does not contradict the visual review: this is a composition and hierarchy issue the detector did not catch.

## Overall Impression

The important information and actions exist, but the card's arrangement makes the user assemble the relationship between them. The biggest opportunity is a compact, stable layout that puts the price first and groups its actions.

## What's Working

- The item and variant hierarchy preserves context.
- Price type and amount appear near each other.
- Bulk selection and per-price editing are available.

## Priority Issues

1. **[P1] Actions are disconnected.** Selection and Edit sit in separate positions on the card, making both slower to scan. Group them in one compact action row, with selection visually secondary. **Suggested command:** `$impeccable layout`.
2. **[P1] The amount loses prominence.** List, UOM, supplier/customer, validity, and margin compete with the main commercial value. Prioritize type and amount; keep list/UOM as the next reading level and move margin or optional details to a quieter line or disclosure. **Suggested command:** `$impeccable distill`.
3. **[P2] Card height and rhythm vary.** Supplier, validity, and margin content change card height. Keep the main structure stable and control wrapping for secondary data. **Suggested command:** `$impeccable layout`.
4. **[P2] Expanded variant decoration repeats state.** Background, shadow, top spacing, and “Variantes desplegadas” repeat information already shown by the expand control. Keep one clear hierarchy cue and remove the repeated label. **Suggested command:** `$impeccable quieter`.

## Persona Red Flags

- **Alex (power user):** margin and details may be useful, but there is too much visual scanning to find the action and amount.
- **Jordan (first-timer):** may not know whether the price belongs to Buying, the list, or the supplier because those facts do not read as one group.
- **Sam (keyboard or screen-reader user):** verify focus and reading order across selection, amount, metadata, and Edit; visually these elements already feel disconnected.

## Minor Observations

- The heading reserves right-side space while “Agregar precio” appears elsewhere; this may waste width or squeeze long names on mobile.
- Optional metadata makes consistent card heights difficult.

## Questions to Consider

- What should dominate the card: amount and type, compact actions, or margin and full context?
- Should margin, supplier, and validity move into expandable details, or remain visible in a secondary line?
- Should this change target only these cards, or simplify the variant header too?
