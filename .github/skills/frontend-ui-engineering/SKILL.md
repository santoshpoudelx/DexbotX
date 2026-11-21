---
name: frontend-ui-engineering
description: Builds production-quality, accessible, responsive user-facing UIs. Use when building or modifying interfaces and pages, creating components, implementing layouts, meeting WCAG accessibility requirements, managing state, or when the output needs to look and feel production-quality rather than AI-generated.
---

# Frontend UI Engineering

Build accessible, performant, responsive interfaces that follow the project's existing design system.

## Core rules

- Colocate component implementation, tests, types, hooks, and stories when appropriate.
- Prefer composition and focused components over deeply configurable components.
- Separate remote-data containers from presentational components.
- Choose local state, lifted state, context, URL state, server-state caching, or a global store based on scope.
- Reuse DexBotX's existing Tailwind CSS tokens, components, and Redux/RTK Query patterns.
- Use the project's spacing, radius, typography, and color conventions; do not introduce arbitrary values or a separate visual language.
- Avoid generic AI aesthetics: excessive gradients, stock card grids, oversized padding, shadow-heavy surfaces, or unrelated purple/indigo palettes.
- Use real content and define loading, empty, error, success, and permission states.

## Accessibility

- Every action must be keyboard accessible.
- Prefer native `<button>`, `<a>`, `<input>`, and `<select>` elements.
- Label icon-only controls and inputs; keep visible labels when helpful.
- Preserve visible focus, logical focus order, skip links where appropriate, and focus management for dialogs.
- Do not use color alone to communicate status.
- Keep text contrast at least 4.5:1 for normal text and 3:1 for large text.
- Test at 320px, 768px, 1024px, and 1440px widths.
- Respect `prefers-reduced-motion`.

## Verification

Before completion:
- Run the relevant frontend lint, typecheck, test, and build commands.
- Confirm keyboard navigation and visible focus.
- Confirm the page or component is usable at mobile and desktop widths.
- Confirm loading, empty, error, success, and permission states.
- Review console output and accessibility warnings.
