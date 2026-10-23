# 9. Plain CSS and the system font

Date: 2026-10-09

## Context

The old site had a violet gradient look that could have belonged to any startup, a 44 MB build, and a component library doing most of the styling. The product is used at a desk by people who are not finance professionals, and it has to feel calm and trustworthy.

## Decision

The design follows Apple's Human Interface Guidelines: the system font, a warm neutral ground, white cards, one accent color reserved for the primary action and any number you can trace, and plain language with finance terms one tap deeper. Styling is CSS modules over a small set of custom properties, with light and dark appearances following the device. No Tailwind, no component library; the handful of primitives (button, card, segmented control, the trace overlay, one chart) live in this repo. The signature interaction is the trace: tap a number and thin lines run from its explanation to the inputs it depends on.

## Consequences

The main bundle is about 90 KB gzipped and the design reads as one thing. Adding a component means writing it, which keeps the set small. The trace overlay measures the DOM, so it is drawn in a passive effect after layout and switched off on narrow screens where the inputs stack below the answer.

## Amended later the same day

The visual direction in this record did not survive review. Commit 07b0614 (2026-10-09) rebuilt the interface dark first: layered dark surfaces with hairline borders instead of the warm neutral ground and white cards, Inter instead of the system font, and a sidebar. A light theme stays available; the app follows the device until someone picks one in the app. The rest of the decision still holds: CSS modules over custom properties, no Tailwind and no component library, one blue accent reserved for the primary action and for numbers you can trace, and the trace as the signature interaction. The title is kept so links to this record keep working.
