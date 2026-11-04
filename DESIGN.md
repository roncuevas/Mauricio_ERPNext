---
name: Mauricio ERPNext
description: A clear, compact desktop for everyday ERP operations.
colors:
  primary: "#2563eb"
  primary-hover: "#1d4ed8"
  primary-soft: "#eff6ff"
  secondary: "#0ea5e9"
  accent: "#dbeafe"
  page: "#f5f7fb"
  surface: "#ffffff"
  surface-muted: "#f8fafc"
  ink: "#172033"
  heading: "#0f172a"
  muted: "#64748b"
  border: "#cbd5e1"
  border-subtle: "#e2e8f0"
  danger: "#dc2626"
  warning: "#b45309"
  success: "#047857"
typography:
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.04em"
rounded:
  sm: "0.5rem"
  md: "0.65rem"
  lg: "0.75rem"
  xl: "1rem"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
    height: "2.5rem"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.heading}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 1rem"
    height: "2.5rem"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.heading}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "0 0.75rem"
    height: "2.5rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1rem"
  badge:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-hover}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.5rem"
---

# Design System: Mauricio ERPNext

## Overview

**Creative North Star: "Escritorio ERP ordenado"**

Mauricio is a clear, professional, familiar workspace for people completing many ERP tasks. Its structure stays compact and predictable so product, price, inventory, and sales information remain easy to scan. The interface serves daily operations; it should not take on the voice or composition of a marketing page.

The default "Azul ERP" theme pairs a practical blue action color with cool, light neutrals. Users can select among ten color themes and switch between light and dark modes. Controls use visible state changes, concise labels, and a consistent hierarchy. Surfaces rely on thin borders with restrained shadows to distinguish working areas.

**Key Characteristics:**
- Compact, familiar operational structure.
- Clear, professional language and hierarchy.
- Practical controls with visible states.
- Themeable color accents over stable neutral surfaces.

## Colors

The default palette is a clear ERP blue over cool gray and white; selectable themes replace the accent family while retaining semantic roles.

### Primary
- **ERP Blue** (`{colors.primary}`): Main actions, selected controls, links, and the active navigation indicator in the default theme.
- **Deep ERP Blue** (`{colors.primary-hover}`): Hover, emphasis, and readable text on soft-blue surfaces.
- **Pale Blue** (`{colors.primary-soft}`): Quiet selection, informational notices, and contextual highlights.

### Secondary
- **Sky Blue** (`{colors.secondary}`): Secondary accent used with the primary theme color in small decorative marks and product accents.

### Neutral
- **Cool Page Gray** (`{colors.page}`): Main application canvas.
- **White Surface** (`{colors.surface}`): Cards, fields, dialogs, and navigation surfaces.
- **Cloud Gray** (`{colors.surface-muted}`): Toolbars, nested areas, and low-emphasis groupings.
- **Ink** (`{colors.ink}`) and **Heading Ink** (`{colors.heading}`): Default text and stronger headings.
- **Slate Muted** (`{colors.muted}`): Supporting text and metadata.
- **Slate Border** (`{colors.border}`) and **Soft Divider** (`{colors.border-subtle}`): Control outlines and separators.
- **Danger Red** (`{colors.danger}`), **Warning Amber** (`{colors.warning}`), and **Success Green** (`{colors.success}`): Semantic feedback.

### Named Rules
**The Theme Role Rule.** Preserve semantic color roles when the user selects another theme; do not hard-code the default blue into new themed components.

## Typography

**Display Font:** Inter (with system sans-serif fallbacks)
**Body Font:** Inter (with system sans-serif fallbacks)
**Label/Mono Font:** System sans-serif labels; monospace is reserved for identifiers and codes.

**Character:** Direct and utilitarian. Strong weights and short labels create hierarchy without introducing a separate display voice.

### Hierarchy
- **Headline** (700, 24px, 1.2): Page title; it reduces to 21.6px on compact POS headers.
- **Title** (600, 16px, 1.4): Section names, card headings, and prominent data labels.
- **Body** (400, 14px, 1.5): Most controls, supporting text, and table content.
- **Label** (600, 12px, 1.4, slightly tracked): Field labels. Many form labels use uppercase styling.
- **Metadata** (600–800, 10–12px): Compact status, identifiers, and table metadata; maintain contrast against its surface.

## Layout

The desktop workspace uses a fixed 272px navigation rail, with an optional collapsed width of 84px, and a centered content region capped at 1600px. Main content padding grows from 16px on narrow screens to 24px at small breakpoints and 32px on large screens. Page groups use compact, repeated gaps rather than large editorial whitespace.

At widths up to 1023px, the desktop rail gives way to a fixed mobile header and an expandable, scrollable navigation sheet. Content clears the 64px header and respects device safe areas. Dense tables switch to card rows at 700px, keeping key values and actions accessible without forcing the desktop table onto a phone.

The compact-density preference reduces card and control height without changing the underlying hierarchy. Preserve minimum control sizes and readable data when applying denser layouts.

## Elevation & Depth

Depth combines thin borders with restrained shadows. Cards receive a shallow resting shadow; larger overlays and menus can sit above the page, while hover elevation remains slight. Dark mode increases shadow contrast and replaces light surfaces with layered dark neutrals. Shadows supplement clear boundaries; they do not replace them.

### Shadow Vocabulary
- **Control lift** (`0 1px 3px rgba(15, 23, 42, .1)`): Subtle separation for compact actionable elements.
- **Card** (`0 4px 14px rgba(15, 23, 42, .06)`): Low emphasis depth on grouped content.
- **Focus ring** (`0 0 0 3px rgba(37, 99, 235, .18)`): Visible keyboard focus on fields and controls; adapt its color to the active theme where supported.

## Shapes

Controls and cards use softly rounded corners: fields and standard buttons are 8px, larger cards 12px, and emphasis containers may reach 16px. Badges use a full pill. Thin neutral borders define most boundaries. Keep corners consistent within a control group and avoid decorative clipping.

## Components

### Buttons
- **Shape:** Softly rounded (8px), compact and consistent with field heights.
- **Primary:** Solid active theme color with white text; standard height 40px and horizontal padding 16px.
- **Secondary:** Surface fill and a neutral border; hover moves to the muted surface.
- **Action:** Smaller, bordered surface button for dense product and price operations; hover fills with the active primary color.
- **Danger:** Semantic red for destructive or lock-related actions.
- **Hover / Focus:** Subtle color shift and 1px lift on hover; return to rest on press. Keep a visible 2px keyboard ring.
- **Disabled:** Reduce opacity and disable pointer interaction.
- **Icon actions:** `IconButton`, `RefreshButton`, `SearchButton`, and `FilterButton` live with `Button` in `src/components/ui/button.tsx`; use Lucide icons and require accessible labels. Import through `src/components/ui.tsx` in screens.

### Chips
- **Style:** Compact pill with a semantic or neutral tint and high-weight text.
- **State:** Use distinct neutral, success, warning, danger, and info tones; keep the label short.

### Cards / Containers
- **Corner Style:** Soft 12px corners, with larger 16px containers used sparingly.
- **Background:** White surface over the page canvas; nested toolbars use the muted surface.
- **Shadow Strategy:** Shallow card shadow paired with a soft border.
- **Border:** Thin soft slate divider.
- **Internal Padding:** Typically 16px, with compact density and smaller mobile cards using less.

### Inputs / Fields
- **Style:** White surface, 1px neutral border, 8px radius, 40px standard height, and 12px horizontal padding.
- **Focus:** Border adopts the active primary color and a visible soft ring.
- **Error / Disabled:** Semantic feedback colors; disabled controls use the muted surface and lower opacity.

### Navigation
- **Desktop:** Fixed white-to-page neutral rail, grouped links, small line icons, and a persistent active-group marker. The rail can collapse to icon navigation.
- **Mobile:** Fixed 64px header with the current page, theme toggle, lock, and menu. The expanded menu scrolls independently and respects safe-area insets.
- **Active / Hover:** Use the active theme's soft tint and stronger text; preserve accessible current-page and expanded-state semantics.

### Product and Variant Data
Product rows prioritize names, status, and operational actions. On mobile, use compact cards with a two-column metadata grid. Variant and price trees use indentation and thin connector borders to communicate hierarchy; keep expand/collapse controls adjacent to their parent rows.

## Do's and Don'ts

### Do:
- **Do** keep operational information compact, scannable, and grouped by task.
- **Do** retain the familiar neutral surfaces and express theme choice through semantic color roles.
- **Do** make active, hover, focus, error, disabled, and loading states visibly distinct.
- **Do** adapt dense tables and navigation for touch-width screens.
- **Do** preserve visible keyboard focus and accessible labels on icon-only controls.

### Don't:
- **Don't** turn operational screens into marketing pages or decorative dashboards.
- **Don't** use color alone to explain status or selection.
- **Don't** replace the compact operational hierarchy with oversized display typography or oversized empty space.
- **Don't** use shadows as the only boundary between related surfaces.
