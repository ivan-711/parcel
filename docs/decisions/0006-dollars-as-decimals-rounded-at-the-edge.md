# 6. Dollars as decimals, rounded at the edge

Date: 2026-10-08

## Context

The plan was to move integer cents across the API and use floats inside the engine. Integer cents make every client format and divide, and the inputs are estimates anyway: nobody knows a rent to the cent.

## Decision

Money crosses the API as plain decimal dollars, rounded to cents on the way out. Rates are decimals, so 7% is 0.07. Inside the engine everything is float64 numpy, and the tests state the tolerance they accept for each metric instead of pretending the math is exact.

## Consequences

The JSON is readable and the web app formats without arithmetic. Rounding happens in one place in the API. The engine's tests compare against worked spreadsheets and numpy's own IRR within stated tolerances, which is the honest way to test floating point finance.
