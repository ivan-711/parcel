# 2. Solve backwards on the forward model

Date: 2026-10-07

## Context

"What's the most I can pay for 12% a year?" used to be answered by a separate reverse formula. It drifted from the forward calculation and gave answers the forward model then contradicted.

## Decision

Reverse solving is root finding on the forward model. The engine sets one input, runs the ledger, reads the target metric, and uses Brent's method to find the input value that hits the target. The same works for any metric and any input. IRR itself is found with Newton's method and a bisection fallback over monthly flows.

## Consequences

Forward and backward answers can never disagree, because there is only one calculation. Every solve costs a few dozen ledger runs, which is still under ten milliseconds. When no input value reaches the target, the solver says so instead of returning a number, and the UI shows that plainly.
