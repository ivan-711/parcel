import { PublicNav } from '../shell/nav'
import styles from './methodology.module.css'

const SECTIONS = [
  ['model', 'One model'],
  ['income', 'Rent and costs'],
  ['loans', 'Loans'],
  ['strategies', 'The five strategies'],
  ['numbers', 'The numbers'],
  ['solving', 'Working backwards'],
  ['uncertainty', 'What could go wrong'],
  ['flags', 'Flags'],
  ['sources', 'Where figures come from'],
  ['memo', 'The memo'],
  ['limits', 'What it leaves out'],
] as const

function F({ children }: { children: string }) {
  return <code className={styles.formula}>{children}</code>
}

export function Methodology() {
  return (
    <>
      <PublicNav />
      <main className={styles.page}>
        <h1>How Parcel does the math.</h1>
        <p className={styles.lead}>
          Every number in the app comes from the rules on this page. If a figure surprises you, this
          is where to check it.
        </p>
        <ul className={styles.toc}>
          {SECTIONS.map(([id, title]) => (
            <li key={id}>
              <a href={`#${id}`}>{title}</a>
            </li>
          ))}
        </ul>

        <h2 id="model">One model</h2>
        <p>
          Parcel doesn&rsquo;t have a rental calculator, a flip calculator and a BRRRR calculator.
          It has one model: a month by month ledger of cash in and cash out, from closing day to the
          day you sell. Each strategy is a recipe for filling that ledger. That is why every
          strategy shows the same numbers and why two deals compare fairly.
        </p>
        <p>
          Month 0 is closing day. It carries the purchase, closing costs and loan fees. Months 1
          onward carry rent, costs, loan payments, repairs and, in the last month, the sale. Every
          month&rsquo;s cash flow is what it leaves in your pocket after all of that. Positive means
          money came to you, negative means you paid.
        </p>
        <F>{`cash flow (month) = rent collected + other income
                  - operating costs - reserves - loan payments
                  - repairs - purchase and closing (month 0)
                  + refinance proceeds - loan payoffs
                  + sale price - selling costs (last month)`}</F>
        <p>
          Dollars are kept as decimal numbers rounded to cents when they cross the API. Nothing is
          computed in your browser; the engine runs on the server, once per change, in well under a
          millisecond.
        </p>

        <h2 id="income">Rent and costs</h2>
        <p>
          Rent starts the month after you own the place, or after any repairs and lease up you set.
          It grows once a year by the rent growth rate. The vacancy rate takes its share off the
          top, every month, as an average: a 5% rate means 5% of each month&rsquo;s rent is treated
          as lost, which is the same as 18 empty days a year.
        </p>
        <F>{`gross rent (month m)  = monthly rent × (1 + rent growth) ^ year(m)
collected (month m)   = gross rent - vacancy + other income
vacancy               = gross rent × vacancy rate`}</F>
        <p>Costs come in two kinds:</p>
        <ul>
          <li>
            <b>Fixed:</b> property tax, insurance, HOA and utilities you pay. Spread evenly over the
            year and grown by the cost growth rate each year. They run from the month you own it,
            whether or not it&rsquo;s rented.
          </li>
          <li>
            <b>Share of rent:</b> management, repairs and reserves. Each is a percentage of the rent
            you actually collected that month, so they fall when the place sits empty.
          </li>
        </ul>
        <p>
          Reserves are money set aside for a roof or a furnace. Parcel takes them out of your cash
          flow every month, because that is what prudent owners do, even though many calculators
          leave them out to make the numbers look better.
        </p>
        <F>{`operating costs = taxes + insurance + HOA + utilities + management + repairs
NOI             = collected - operating costs
cash flow       = NOI - reserves - loan payments`}</F>

        <h2 id="loans">Loans</h2>
        <p>
          A loan is funded on a given month, charges interest on its balance each month, and is paid
          off by a refinance, a balloon or the sale. Amortizing loans use the standard level
          payment. Interest only loans pay interest until they are retired. Points and closing costs
          are paid at funding.
        </p>
        <F>{`monthly rate    = annual rate / 12
level payment   = balance × r / (1 - (1 + r) ^ -n)      r = monthly rate, n = months
interest (m)    = balance (m - 1) × r
principal (m)   = payment - interest (m)`}</F>
        <p>
          A loan taken over subject to the seller keeps its original schedule: the balance, rate and
          months left you enter are what drive the payments. A seller note can amortize, be interest
          only, or balloon after a set number of years, at which point the full balance comes due.
        </p>

        <h2 id="strategies">The five strategies</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>What goes in the ledger</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Rental</td>
              <td>
                Buy with a down payment and a mortgage. Optional repairs up front. Rent until you
                sell at the end of the hold.
              </td>
            </tr>
            <tr>
              <td>BRRRR</td>
              <td>
                Buy with a short term loan that covers part of the price and repairs. Fix it, rent
                it, then after the seasoning period refinance at a share of the new value. The new
                loan pays off the first one plus refinance costs; whatever is left comes back to
                you. Rent until you sell.
              </td>
            </tr>
            <tr>
              <td>Flip</td>
              <td>
                Buy, repair over a set number of months, then sell after the months it takes to find
                a buyer. Taxes, insurance, utilities and loan interest run the whole time. No rent.
              </td>
            </tr>
            <tr>
              <td>Wholesale</td>
              <td>
                Parcel runs the end buyer&rsquo;s flip in full and solves for the highest price at
                which the buyer still makes their profit margin. Your fee is that price minus your
                contract price. The 70% rule (70% of resale value minus repairs) is shown beside it
                as the rule of thumb flippers use.
              </td>
            </tr>
            <tr>
              <td>Creative finance</td>
              <td>
                Take over the seller&rsquo;s loan on its real schedule, pay the seller some cash,
                and cover the rest with a note to the seller. Rent until you sell. A balloon on the
                note shows up as a payoff in that month.
              </td>
            </tr>
          </tbody>
        </table>

        <h2 id="numbers">The numbers</h2>
        <p>
          The app shows each number in plain words. These are the names a lender or a spreadsheet
          would use, and exactly how each one is computed from the ledger. The &ldquo;stabilized
          year&rdquo; is the first full twelve months once rent is flowing and the long term loan is
          in place.
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>In the app</th>
              <th>Usual name</th>
              <th>How it&rsquo;s computed</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>a month in your pocket</td>
              <td>Cash flow</td>
              <td>Stabilized year NOI, minus reserves, minus loan payments, divided by twelve.</td>
            </tr>
            <tr>
              <td>a year on your money</td>
              <td>IRR</td>
              <td>
                The annual rate that makes the present value of every month&rsquo;s cash flow,
                including the purchase and the sale, add up to zero. Found by Newton&rsquo;s method
                with a bisection fallback, then annualized. Shown as n/a when the cash never comes
                back.
              </td>
            </tr>
            <tr>
              <td>cash to close</td>
              <td>Cash to close</td>
              <td>
                Everything paid on closing day: down payment, closing costs, points, and repairs
                paid up front.
              </td>
            </tr>
            <tr>
              <td>rent covers the loan</td>
              <td>DSCR</td>
              <td>
                Stabilized year NOI divided by loan payments. Below 1.0x the rent doesn&rsquo;t
                cover the payment.
              </td>
            </tr>
            <tr>
              <td>profit</td>
              <td>Total profit</td>
              <td>The sum of every month&rsquo;s cash flow, closing day and sale included.</td>
            </tr>
            <tr>
              <td>return on your cash</td>
              <td>ROI</td>
              <td>Total profit divided by the most cash you had in the deal at any point.</td>
            </tr>
            <tr>
              <td>back at the refinance</td>
              <td>Cash out</td>
              <td>New loan, minus refinance costs, minus the loans it pays off.</td>
            </tr>
            <tr>
              <td>still in the deal after</td>
              <td>Cash left in deal</td>
              <td>
                Cash you had put in by the stabilized month, less what the refinance returned.
              </td>
            </tr>
            <tr>
              <td>times your money</td>
              <td>Equity multiple</td>
              <td>All the cash that came to you divided by all the cash you put in.</td>
            </tr>
            <tr>
              <td>needs to be rented X% of the time</td>
              <td>Break even occupancy</td>
              <td>
                The occupancy at which collected rent, less the costs that scale with it, just
                covers fixed costs and loan payments.
              </td>
            </tr>
          </tbody>
        </table>
        <F>{`cap rate            = stabilized NOI / price
cash on cash        = stabilized cash flow / cash left in deal
yield on cost       = stabilized NOI / (price + closing + repairs)
break even occupancy = (fixed costs + loan payments)
                       / (potential rent × (1 - variable costs / collected rent))
NPV                 = Σ cash flow (m) / (1 + d) ^ m         d = 10% a year, monthly
payback             = first month the running total is back above zero`}</F>
        <div className={styles.aside}>
          Cash on cash uses cash to close plus repairs, not the down payment alone. Calculators that
          ignore closing costs and repairs overstate it, often by a third.
        </div>

        <h2 id="solving">Working backwards</h2>
        <p>
          &ldquo;What&rsquo;s the most I can pay and still make 12% a year?&rdquo; is answered by
          running the forward model repeatedly and searching for the input that hits the target,
          using Brent&rsquo;s method on the exact same code that produces the workspace numbers.
          There is no separate reverse formula, so the forward and backward answers can never
          disagree. If no value of the input reaches the target, the app says so instead of
          inventing one.
        </p>

        <h2 id="uncertainty">What could go wrong</h2>
        <h3>What moves the return most</h3>
        <p>
          Each input is nudged down and up on its own (rent and value by 10%, rates by a point, and
          so on) and the return is recomputed. The inputs are ranked by how far they swing it. The
          grid does the same for two inputs at once, price against rent.
        </p>
        <h3>Ten thousand versions</h3>
        <p>
          The simulation draws ten thousand versions of the deal at once, varying several inputs
          together, and reports how many lose money and what a bad, typical and good year look like
          (the 10th, 50th and 90th percentiles of the return). The draws:
        </p>
        <ul>
          <li>Rent: normal, standard deviation 8% of the rent you entered.</li>
          <li>Vacancy: normal, standard deviation 3 points.</li>
          <li>Cost growth: normal, standard deviation 1 point.</li>
          <li>Repairs: overruns only, 15% standard deviation, never under budget.</li>
          <li>Value after repairs: normal, standard deviation 7%.</li>
          <li>Value growth: normal, standard deviation 2 points.</li>
        </ul>
        <p>
          Nothing drops below zero where that makes no sense. The runs are vectorized, so all ten
          thousand ledgers take about 150 milliseconds. The seed is fixed per request, so running it
          twice gives the same answer.
        </p>

        <h2 id="flags">Flags</h2>
        <p>
          Parcel raises a flag whenever a deal trips one of these rules. They sit right under the
          answer.
        </p>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Flag</th>
              <th>Rule</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Rent doesn&rsquo;t cover the loan</td>
              <td>DSCR under 1.0x. Under 1.25x is a caution, since most lenders want more room.</td>
            </tr>
            <tr>
              <td>Loses money every month</td>
              <td>Stabilized cash flow is negative.</td>
            </tr>
            <tr>
              <td>Borrowing lowers your return</td>
              <td>
                The cap rate is below the loan rate, so borrowing costs more than the property
                earns.
              </td>
            </tr>
            <tr>
              <td>Optimistic vacancy</td>
              <td>Vacancy set under 3%.</td>
            </tr>
            <tr>
              <td>No reserves</td>
              <td>Reserves set to zero.</td>
            </tr>
            <tr>
              <td>Refinance falls short</td>
              <td>The new BRRRR loan doesn&rsquo;t pay off the first one.</td>
            </tr>
            <tr>
              <td>Thin flip</td>
              <td>Profit under 10% of the resale price.</td>
            </tr>
            <tr>
              <td>Balloon due</td>
              <td>A seller note comes due in full during the hold.</td>
            </tr>
          </tbody>
        </table>

        <h2 id="sources">Where figures come from</h2>
        <p>
          When you look up an address, each suggested number is labeled with its source and the app
          keeps that label next to the number for as long as the deal exists:
        </p>
        <ul>
          <li>
            <b>Rent and value:</b> RentCast estimates with their low and high range. Parcel is on a
            small plan, so each address is looked up once and cached for 30 days, with a daily limit
            per person.
          </li>
          <li>
            <b>Rent, when RentCast is unavailable:</b> HUD Fair Market Rent for the county and
            bedroom count.
          </li>
          <li>
            <b>Property tax:</b> the county&rsquo;s median effective rate from the Census American
            Community Survey, times the value estimate. Your actual bill may differ; replace it when
            you have it.
          </li>
          <li>
            <b>Loan rate:</b> the Freddie Mac weekly 30 year average from FRED, plus half a point,
            since investor loans price above owner occupied ones.
          </li>
          <li>
            <b>Insurance:</b> a labeled rough guess of 0.5% of value a year. Always get a quote.
          </li>
          <li>
            <b>Everything else:</b> a stated planning default you can change, or your own number.
          </li>
        </ul>
        <p>
          Parcel never fills a cost with zero because it doesn&rsquo;t know it. Missing inputs block
          the strategies that need them.
        </p>

        <h2 id="memo">The memo</h2>
        <p>
          The written memo is drafted by a language model from a table of the engine&rsquo;s figures
          for that deal. Before you see it, every dollar amount, percentage and ratio in the text is
          parsed out and matched against that table at the precision it was written in. If a figure
          doesn&rsquo;t match, the memo is sent back once with the mismatches named. If it still
          doesn&rsquo;t match, it is shown with the unmatched figures listed, so a made up number
          can never pass as a computed one.
        </p>

        <h2 id="limits">What it leaves out</h2>
        <ul>
          <li>Income taxes, depreciation and 1031 exchanges. Returns here are before tax.</li>
          <li>Rent control, local ordinances and lender specific rules.</li>
          <li>Partial month proration. Everything happens on month boundaries.</li>
          <li>Inflation beyond the growth rates you set.</li>
        </ul>
        <p>
          Parcel is a projection tool, not advice. The source is public at{' '}
          <a href="https://github.com/ivan-711/parcel">github.com/ivan-711/parcel</a>, and the
          engine&rsquo;s tests check every formula on this page against worked examples.
        </p>
      </main>
    </>
  )
}
