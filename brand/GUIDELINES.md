# agent-floor-ui: Logo Guidelines

## 1. The logo

- **Idea:** an agent (coral head) standing on stacked isometric floors (ink plates): the characters and the levels they work on, in one mark.
- **Construction:** 256-unit grid; unit 26 = head radius = plate thickness = plate gap. All edges use true 30° isometric angles, the same projection as the app.
- **Versions:** horizontal (primary), stacked, symbol only, wordmark only. Masters are in [final/](final/), and [build_logo.py](build_logo.py) regenerates them.

| Use | File |
|---|---|
| README, website header | `agent-floor-horizontal.svg` |
| Dark backgrounds | `agent-floor-horizontal-reversed.svg`, `agent-floor-symbol-reversed.svg` |
| Square spaces, slides | `agent-floor-stacked.svg` |
| Avatars, app tiles | `agent-floor-symbol-app-icon.svg`, `icon-512.png` |
| 48 px and below | `agent-floor-symbol-small.svg`, `favicon.svg`, `favicon.ico` |
| One colour | `*-black.svg`, `*-white.svg`, `*-mono-273534.svg`, `agent-floor-symbol-mono-e57958.svg` |

## 2. Clear space

Keep at least **one head diameter** (the coral circle) clear on every side. The space scales with the logo.

## 3. Minimum size

| Version | Screen | Print |
|---|---|---|
| Horizontal | 120 px wide | 30 mm wide |
| Stacked | 72 px wide | 18 mm wide |
| Symbol | 16 px (use the small cut below 48 px) | 6 mm |

## 4. Colour

| Name | Role | HEX | RGB | CMYK (approx.) |
|---|---|---|---|---|
| Agent Coral | Head, accents, app tile | `#E57958` | 229 121 88 | 0 47 62 10 |
| Floor Ink | Plates, wordmark | `#273534` | 39 53 52 | 26 0 2 79 |
| Paper | Light backgrounds, reversed plates | `#F6F7F9` | 246 247 249 | 1 1 0 2 |

CMYK values are conversions, not press-proofed. No Pantone match has been specified.

**Approved pairs:** full colour on white or Paper; reversed (coral head, Paper plates) on Floor Ink or near-black; white symbol on Agent Coral; one-colour black or white where only one colour can print.

Agent Coral reaches about 2.9:1 against white. That is fine for the logo, but don't use coral for small text on white.

## 5. Typography

- **Wordmark:** Space Grotesk, with **agent** at 700 and **floor** at 400, tracking −18/1000. It is converted to outlines; never retype it.
- **Interface:** Space Grotesk for headings, DM Sans for body text, and a system sans-serif stack as fallback.
- **Licence:** both fonts use the SIL Open Font License 1.1 ([SpaceGrotesk-OFL.txt](final/SpaceGrotesk-OFL.txt)), which permits logo use.

## 6. Don'ts

Don't stretch, rotate, or skew the mark (the isometric angles are the idea). Don't recolour the head and plates outside the palette. Don't add shadows, outlines, gradients, or 3D effects. Don't change the gaps or move the head. Don't rearrange lockups. Don't place the logo on busy backgrounds without a Paper or Ink container.

## 7. Notes

- No trademark search has been run. Do one before public launch.
- Presentation board: [presentation.html](presentation.html) (slides in [slides/](slides/)).
