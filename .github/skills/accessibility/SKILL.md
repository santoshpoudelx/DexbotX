---
name: accessibility
description: Audit and improve web accessibility following WCAG 2.2 guidelines. Use when asked to improve accessibility, perform an a11y audit, support screen readers, verify keyboard navigation, or work toward WCAG compliance.
license: MIT
metadata:
  author: web-quality-skills
  version: "2.0"
---

# Accessibility

Use WCAG 2.2 and the project's existing evidence to make DexBotX interfaces usable by keyboard and assistive-technology users.

## Principles

- Perceivable: provide text alternatives, adequate contrast, and captions or transcripts where applicable.
- Operable: make every action keyboard reachable and avoid traps or inaccessible drag-only interactions.
- Understandable: use clear labels, consistent navigation, predictable forms, and actionable errors.
- Robust: use semantic HTML and correct ARIA only when native elements cannot express the behavior.

## Must-check items

- Native controls are preferred over ARIA re-created controls.
- Every icon-only control has an accessible name.
- Form inputs have associated labels, invalid state, and announced error text.
- Focus is visible and not obscured by sticky headers or overlays.
- Interactive targets are at least 24x24 CSS pixels; 44x44 is preferred.
- Skip links or equivalent bypass mechanisms exist for repetitive navigation.
- Dynamic updates use appropriate live regions without moving focus unexpectedly.
- Page language, heading structure, landmarks, and link text are meaningful.
- Authentication supports paste/autofill and accessible alternatives.
- Reduced-motion preferences disable nonessential animation.
- Text contrast meets 4.5:1 for normal text and 3:1 for large text; UI graphics meet 3:1.

## Audit workflow

1. Reproduce the relevant live page or component.
2. Run Lighthouse or axe coverage if available.
3. Inspect names, roles, states, landmarks, and heading structure.
4. Tab through the full flow and verify Enter/Space activation and focus visibility.
5. Test zoom/reflow, reduced motion, mobile targets, and screen-reader output.
6. Fix source code and rerun the same checks.

Automated results do not establish full WCAG conformance; document manual checks that cannot be run.
