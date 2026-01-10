const HelpPage = () => (
  <section className="stack">
    <h1>Help</h1>

    <div className="card stack">
      <h2>Scenario run page</h2>

      <div className="stack">
        <h3>Balance over time graph</h3>
        <p className="muted">
          Shows total portfolio balance by age. Use this to see the overall trajectory and
          whether the plan stays positive through retirement.
        </p>
      </div>

      <div className="stack">
        <h3>Ordinary income graph</h3>
        <p className="muted">
          The stacked areas show sources of ordinary income:
        </p>
        <ul>
          <li>Salary and other income: work income from future work periods.</li>
          <li>
            Investment income: ordinary taxable income from events and other taxable cashflows,
            such as interest or dividends from taxable holdings, cash account interest, bond
            coupon payments, and other ordinary investment payouts recorded through events or
            pension inputs.
          </li>
          <li>Taxable social security: ordinary income from Social Security benefits.</li>
          <li>Taxable pension and annuity: ordinary income from pension strategies.</li>
          <li>Withdrawal from tax deferred: traditional withdrawals and Roth conversions.</li>
        </ul>
        <p className="muted">
          The dashed tax band lines represent ordinary tax bracket thresholds. Each line is the
          top of a bracket for that year and is adjusted by CPI inflation. If the stacked areas
          cross a band, additional income is taxed at higher marginal rates.
        </p>
      </div>

      <div className="stack">
        <h3>Timeline</h3>
        <p className="muted">Year rows show summary values for each year.</p>
        <ul>
          <li>Start date: first month of the year.</li>
          <li>Age (end of year): age at the year end.</li>
          <li>Balance: ending total balance for the year.</li>
          <li>Contribution: total deposits for the year.</li>
          <li>Spending: total spending for the year.</li>
        </ul>
        <p className="muted">
          Expand a year to see monthly rows. Expand a month to see module activity and account
          balances.
        </p>

        <h4>Module activity columns</h4>
        <ul>
          <li>Cash: net cashflow impact (positive adds cash, negative spends cash).</li>
          <li>
            Ord inc: ordinary income produced (for example, wages, pension payments, or taxable
            interest).
          </li>
          <li>
            Cap gains: capital gains produced (for example, selling appreciated holdings).
          </li>
          <li>
            Deductions: deductions produced (for example, pre-tax 401k or HSA contributions).
          </li>
          <li>
            Tax exempt: tax-exempt income produced (for example, municipal bond interest).
          </li>
          <li>
            Deposit / Withdraw / Convert: holding actions taken (for example, moving cash into a
            holding, selling a holding, or converting traditional to Roth).
          </li>
          <li>
            Market: market return totals for the month (for example, price appreciation and
            reinvested income).
          </li>
        </ul>

        <h4>Module descriptions</h4>
        <ul>
          <li>
            Spending: recurring living and discretionary spending that reduces cash (for example,
            monthly housing costs, utilities, groceries, or travel).
          </li>
          <li>
            Events: one-off cashflows that hit on specific dates (for example, a home sale,
            inheritance, or large purchase).
          </li>
          <li>
            Pensions: scheduled pension or annuity income streams (for example, a monthly employer
            pension or annuity payout).
          </li>
          <li>
            Healthcare: medical premiums, out-of-pocket costs, and IRMAA surcharges (for example,
            Medicare Part B and D premiums).
          </li>
          <li>
            Charitable: annual giving plus QCD flows from traditional accounts (for example,
            routing RMDs directly to charity).
          </li>
          <li>
            Work: salary/bonus income, 401k deferrals, employer match deposits, and HSA
            contributions (for example, payroll deductions into a 401k or HSA).
          </li>
          <li>
            Social Security: benefit payments based on earnings history and claiming age.
          </li>
          <li>
            Cash buffer: refills cash from investments when low or invests excess cash when high
            to keep cash within the target range, covering deficits when spending exceeds cash.
          </li>
          <li>
            Rebalancing: trades holdings to return to target allocations after drift (for example,
            selling equities to buy bonds after a bull run).
          </li>
          <li>
            Conversions: Roth conversions and ladder steps that move assets from traditional to
            Roth accounts (for example, converting up to a target tax bracket each year).
          </li>
          <li>
            RMD: required minimum distributions from traditional accounts after the start age.
          </li>
          <li>
            Taxes: federal and state tax calculations based on ordinary income, capital gains,
            and deductions, including bracket thresholds and credits.
          </li>
          <li>
            Market returns: investment and cash account growth from modeled returns (for example,
            monthly stock/bond returns).
          </li>
        </ul>
      </div>
    </div>
  </section>
)

export default HelpPage
