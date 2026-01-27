import type { UseFormRegister } from 'react-hook-form'
import { taxTypeSchema } from '../../../core/models'
import type { ScenarioEditorValues } from '../scenarioEditorTypes'

type LadderSpendingRow = {
  startAgeLabel: string
  endAgeLabel: string
  annualNeed: number
  annualWant: number
  annualHealthcare: number
  annualTotal: number
}

type EarlyRetirementSectionProps = {
  register: UseFormRegister<ScenarioEditorValues>
  rothConversionBrackets: Array<{ rate: number; upTo?: number | null }>
  formatCurrency: (value: number) => string
  rothConversionStartDate: string
  rothConversionEndDate: string
  ladderStartDate: string
  ladderEndDate: string
  ladderConversionStart: number
  ladderConversionEnd: number
  ladderConversionStartDate: string
  ladderConversionEndDate: string
  ladderSpendingRows: LadderSpendingRow[]
}

const EarlyRetirementSection = ({
  register,
  rothConversionBrackets,
  formatCurrency,
  rothConversionStartDate,
  rothConversionEndDate,
  ladderStartDate,
  ladderEndDate,
  ladderConversionStart,
  ladderConversionEnd,
  ladderConversionStartDate,
  ladderConversionEndDate,
  ladderSpendingRows,
}: EarlyRetirementSectionProps) => (
  <div className="card stack" id="section-early-retirement">
    <div className="row">
      <h2>Early retirement</h2>
    </div>
    <div className="stack">
      <h3>Early retirement</h3>
      <div className="form-grid">
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.earlyRetirement.allowPenalty')} />
          <span>Allow early penalties</span>
        </label>
        <label className="field">
          <span>Penalty rate</span>
          <input
            type="number"
            step="0.01"
            {...register('scenario.strategies.earlyRetirement.penaltyRate', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.earlyRetirement.use72t')} />
          <span>Use 72(t)</span>
        </label>
        <label className="field">
          <span>Bridge cash years</span>
          <input
            type="number"
            {...register('scenario.strategies.earlyRetirement.bridgeCashYears', {
              valueAsNumber: true,
            })}
          />
        </label>
      </div>
    </div>

    <div className="stack">
      <h3>Roth conversions</h3>
      <div className="form-grid">
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.rothConversion.enabled')} />
          <span>Enable Roth conversions</span>
        </label>
        <label className="field">
          <span>Target tax bracket</span>
          <select
            {...register('scenario.strategies.rothConversion.targetOrdinaryBracketRate', {
              setValueAs: (value) => (value === '' ? 0 : Number(value)),
            })}
          >
            <option value={0}>None</option>
            {rothConversionBrackets.map((bracket) => (
              <option key={`${bracket.rate}-${bracket.upTo ?? 'top'}`} value={bracket.rate}>
                {`${Math.round(bracket.rate * 100)}% bracket${
                  bracket.upTo ? ` (up to ${formatCurrency(bracket.upTo)})` : ''
                }`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Conversion start age</span>
          <input
            type="number"
            {...register('scenario.strategies.rothConversion.startAge', { valueAsNumber: true })}
          />
        </label>
        <label className="field">
          <span>Conversion end age</span>
          <input
            type="number"
            {...register('scenario.strategies.rothConversion.endAge', { valueAsNumber: true })}
          />
        </label>
        <label className="field">
          <span>Min conversion</span>
          <input
            type="number"
            {...register('scenario.strategies.rothConversion.minConversion', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Max conversion</span>
          <input
            type="number"
            {...register('scenario.strategies.rothConversion.maxConversion', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Conversion start date</span>
          <input readOnly value={rothConversionStartDate} />
        </label>
        <label className="field">
          <span>Conversion end date</span>
          <input readOnly value={rothConversionEndDate} />
        </label>
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.rothConversion.respectIrmaa')} />
          <span>Respect IRMAA</span>
        </label>
      </div>
    </div>

    <div className="stack">
      <h3>Roth ladder</h3>
      <div className="form-grid">
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.rothLadder.enabled')} />
          <span>Enable Roth ladder</span>
        </label>
        <label className="field">
          <span>Ladder lead time (years)</span>
          <input
            type="number"
            {...register('scenario.strategies.rothLadder.leadTimeYears', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Availability start age (after lead time)</span>
          <input
            type="number"
            {...register('scenario.strategies.rothLadder.startAge', { valueAsNumber: true })}
          />
        </label>
        <label className="field">
          <span>Availability end age (after lead time)</span>
          <input
            type="number"
            {...register('scenario.strategies.rothLadder.endAge', { valueAsNumber: true })}
          />
        </label>
        <div className="muted">
          Availability window:<br />
          {ladderStartDate}–{ladderEndDate}
        </div>
        <div className="muted">
          Conversion window:<br />
          {ladderConversionStart.toFixed(1)}–{ladderConversionEnd.toFixed(1)}<br />
          {ladderConversionStartDate}–{ladderConversionEndDate}
        </div>
        <div className="stack" style={{ gridColumn: '1 / -1' }}>
          <span className="muted">Spending totals (availability window)</span>
          {ladderSpendingRows.length === 0 ? (
            <p className="muted">No spending intervals in this availability range.</p>
          ) : (
            <table className="table compact">
              <thead>
                <tr>
                  <th>Start age</th>
                  <th>End age</th>
                  <th>Need total (annual)</th>
                  <th>Want total (annual)</th>
                  <th>Healthcare total (annual)</th>
                  <th>Total (annual)</th>
                </tr>
              </thead>
              <tbody>
                {ladderSpendingRows.map((row) => (
                  <tr key={`${row.startAgeLabel}-${row.endAgeLabel}`}>
                    <td>{row.startAgeLabel}</td>
                    <td>{row.endAgeLabel}</td>
                    <td>{formatCurrency(row.annualNeed)}</td>
                    <td>{formatCurrency(row.annualWant)}</td>
                    <td>{formatCurrency(row.annualHealthcare)}</td>
                    <td>{formatCurrency(row.annualTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <label className="field">
          <span>Target after-tax spending (annual)</span>
          <input
            type="number"
            {...register('scenario.strategies.rothLadder.targetAfterTaxSpending', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Annual conversion</span>
          <input
            type="number"
            {...register('scenario.strategies.rothLadder.annualConversion', {
              valueAsNumber: true,
            })}
          />
        </label>
      </div>
    </div>

    <div className="stack">
      <h3>Required minimum distributions</h3>
      <div className="form-grid">
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.rmd.enabled')} />
          <span>Apply RMDs</span>
        </label>
        <label className="field">
          <span>RMD start age</span>
          <input
            type="number"
            {...register('scenario.strategies.rmd.startAge', { valueAsNumber: true })}
          />
        </label>
        <label className="field">
          <span>Excess handling</span>
          <select {...register('scenario.strategies.rmd.excessHandling')}>
            <option value="spend">Spend</option>
            <option value="taxable">Taxable</option>
            <option value="roth">Roth</option>
          </select>
        </label>
        <label className="field">
          <span>Withholding rate</span>
          <input
            type="number"
            step="0.01"
            {...register('scenario.strategies.rmd.withholdingRate', { valueAsNumber: true })}
          />
        </label>
        <div className="field">
          <span>RMD account types</span>
          <div className="line-item-flags">
            {taxTypeSchema.options.map((taxType) => (
              <label className="field checkbox" key={taxType}>
                <input
                  type="checkbox"
                  value={taxType}
                  {...register('scenario.strategies.rmd.accountTypes')}
                />
                <span>{taxType}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  </div>
)

export default EarlyRetirementSection
