# HaptiLog icon A

Selected direction: a large white microphone with two short coral haptic bars
on either side, on a charcoal background. The microphone remains the primary
shape. The complication uses the same geometry entirely in white, without a
background or a recording-status dot.

- Colors: charcoal `#121318`, white `#FFFFFF`, coral `#FF735E`.
- Android adaptive foreground: 108-unit viewport, mark within the central safe zone.
- Complication: 24dp vector, 66-unit viewport with generous padding.
- Legacy square/round launchers: 48, 72, 96, 144 and 192px.
- Google Play listing: root `haptilog_icon_512.png` and
  `web/public/playstore/icon_512.png`, opaque 512px square PNGs.
- SVG masters and 24/32px monochrome previews are stored beside this file.

Regenerate all exports from the shared path geometry:

```sh
python3 scripts/branding/generate_icons.py
```

Requires Python 3 and system libcairo; no Python packages. Edit the generator
rather than individual generated assets. These are deterministic vector assets
based on the selected concept, not crops of the generated comparison board.

Play listing assets require a separate Console upload; changing the packaged
launcher alone does not update the listing. Preview PNGs demonstrate export
geometry, not on-device validation.
