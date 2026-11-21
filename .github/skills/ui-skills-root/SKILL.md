---
name: ui-skills-root
description: Use before UI-related work to select the smallest useful UI Skills context through the ui-skills CLI.
license: MIT
metadata:
  author: ibelick
  version: "1.0.0"
---

# UI Skills Root

This skill routes UI work to the smallest useful context.

Use 1 skill for focused UI tasks, 2 only for two clear angles, and 3 only for broad redesign or multi-surface review.
Route by topic, then stack, then specificity. Prefer framework-specific guidance when the stack is obvious.

CLI:

```bash
npx ui-skills start
npx ui-skills categories
npx ui-skills list --category <category>
npx ui-skills get <slug>
```
