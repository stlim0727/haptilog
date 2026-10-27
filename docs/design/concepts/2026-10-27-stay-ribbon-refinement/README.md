# Stay ribbon refinement: selected option B

The user selected **B: open bracket** from the three variants in `index.html`.
The journal now uses a 4px vertical stroke with 10×3px end caps, pointing toward
its associated rows. Each lane is 10px wide; existing place colors, focus outline,
hover brightness, selection handlers, and grouping logic are retained.

The caps bound each displayed segment, not actual arrival/departure times.
Ribbon length still reflects list geometry rather than elapsed time. This change
does not add cross-day continuation semantics or change observation labels.

Validation:

- `npm run build` passed on the PR worktree based on `origin/main`.
- Browser checks on the original implementation worktree at 390px and 1280px
  confirmed 10px lanes, a 4px stroke, 10×3px caps inheriting the place color,
  and no document horizontal overflow. A ribbon click completed successfully.
- `implemented-390.png` and `implemented-1280.png` are cropped journal screenshots
  from those browser checks using synthetic demo data. They are not production
  screenshots; unrelated place-settings work was present in that worktree.
- The comparison HTML is a standalone design artifact with synthetic data.

Production deployment is outside this change.
