---
name: Legacy workspace data
description: Saved workspaces from the first app version carry stale calculation fields; how to treat them.
---
Workspaces saved by the first version store `assetId`/`quantityIds` on total tiles and put the linked parent into interest tiles' `selected`. These must never act as hidden inputs.

**Why:** the user saw a detached total keep its old value because the calculator fell back to those stored fields.

**How to apply:** totals compute only from their horizontal chain; when a horizontal link is removed, strip the old parent from the child's inputs. Keep the localStorage keys unchanged so old saves still load.
