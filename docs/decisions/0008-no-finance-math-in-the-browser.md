# 8. No finance math in the browser

Date: 2026-10-09

## Context

The old frontend had a sensitivity matrix with its own formulas, including a stray 15% added to net operating income. Two implementations of the same math drift, and the browser one never had tests.

## Decision

The web app computes nothing financial. Every number on screen comes from the API, including the live recalculation while you type, which is a debounced call to the analyze endpoint that answers in well under a millisecond of engine time. The client is generated from the API's OpenAPI schema, so a renamed field fails the typecheck instead of showing a blank. What the browser does own is words: turning the engine's figures into the plain sentences and explanations the app leads with, and that module has unit tests of its own.

## Consequences

One model, tested once. The UI stays simple because its job is presentation. The one grey area is display arithmetic like dividing an annual figure by twelve, which is allowed, while anything that resembles a formula is not.
