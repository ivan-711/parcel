# 7. A memo that cannot invent numbers

Date: 2026-10-08

## Context

A language model writes a readable deal summary far better than templates do, and it will also happily round 15.47% to 16% or invent a cap rate. A memo with one made up figure is worse than no memo.

## Decision

The model gets a table of the engine's figures and is told to use them as written. Before the memo reaches anyone, every dollar amount, percentage, multiple, ratio and duration in the text is parsed out and matched against that table at the precision it was written in, so "$224k" matches $223,640 but "$230,000" does not. One mismatch sends the draft back once with the mismatches named. A second failure is saved with the unmatched figures listed and shown with a warning. Memos are cached by a hash of the deal's inputs and rate limited per user and per day across everyone.

## Consequences

The memo is checkable, and the check is a plain parser with tests, not another model. An offline set of twenty recorded deals runs in the test suite so prompt changes are measured. The limits keep the feature affordable on a personal API key.
