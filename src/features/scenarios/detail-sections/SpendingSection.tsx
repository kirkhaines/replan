import type {
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFormRegister,
} from 'react-hook-form'
import {
  inflationTypeSchema,
  longTermCareLevelSchema,
  taxTreatmentSchema,
  type SpendingStrategy,
} from '../../../core/models'
import type { ScenarioEditorValues, SpendingIntervalRow } from '../scenarioEditorTypes'

type SpendingSectionProps = {
  register: UseFormRegister<ScenarioEditorValues>
  selectedSpendingStrategyId: string | undefined
  spendingStrategies: SpendingStrategy[]
  onSpendingStrategySelect: (value: string) => void | Promise<void>
  onEditSpendingStrategy: () => void
  onAddSpendingStrategy: () => void
  spendingSummaryRows: SpendingIntervalRow[]
  formatCurrency: (value: number) => string
  longTermCareLevel: string | undefined
  appendEvent: UseFieldArrayAppend<ScenarioEditorValues, 'scenario.strategies.events'>
  removeEvent: UseFieldArrayRemove
  eventRows: FieldArrayWithId<ScenarioEditorValues, 'scenario.strategies.events', 'id'>[]
  createUuid: () => string
}

const SpendingSection = ({
  register,
  selectedSpendingStrategyId,
  spendingStrategies,
  onSpendingStrategySelect,
  onEditSpendingStrategy,
  onAddSpendingStrategy,
  spendingSummaryRows,
  formatCurrency,
  longTermCareLevel,
  appendEvent,
  removeEvent,
  eventRows,
  createUuid,
}: SpendingSectionProps) => (
  <div className="card stack" id="section-spending">
    <div className="row">
      <h2>Spending</h2>
    </div>
    <div className="stack">
      <div className="row">
        <h3>Budget</h3>
      </div>
      <div className="row">
        <label className="field">
          <span>Budget</span>
          <select
            value={selectedSpendingStrategyId ?? ''}
            onChange={(event) => void onSpendingStrategySelect(event.target.value)}
          >
            {spendingStrategies.length === 0 ? (
              <option value="">No spending strategies available</option>
            ) : null}
            {spendingStrategies.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>
                {strategy.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary"
          type="button"
          disabled={!selectedSpendingStrategyId}
          onClick={onEditSpendingStrategy}
        >
          Edit budget
        </button>
        <button className="button secondary" type="button" onClick={onAddSpendingStrategy}>
          Add budget
        </button>
      </div>

      {spendingSummaryRows.length === 0 ? (
        <p className="muted">No spending line items for this strategy.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>Need total (monthly)</th>
              <th>Want total (monthly)</th>
            </tr>
          </thead>
          <tbody>
            {spendingSummaryRows.map((row) => (
              <tr key={`${row.startLabel}-${row.endLabel}`}>
                <td>{row.startLabel}</td>
                <td>{row.endLabel}</td>
                <td>{formatCurrency(row.needTotal)}</td>
                <td>{formatCurrency(row.wantTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>

    <div className="stack">
      <h3>Healthcare</h3>
      <div className="form-grid">
        <label className="field">
          <span>Pre-Medicare premium</span>
          <input
            type="number"
            {...register('scenario.strategies.healthcare.preMedicareMonthly', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Medicare Part B</span>
          <input
            type="number"
            {...register('scenario.strategies.healthcare.medicarePartBMonthly', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Medicare Part D</span>
          <input
            type="number"
            {...register('scenario.strategies.healthcare.medicarePartDMonthly', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Medigap / MA plan</span>
          <input
            type="number"
            {...register('scenario.strategies.healthcare.medigapMonthly', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Health inflation</span>
          <select {...register('scenario.strategies.healthcare.inflationType')}>
            {inflationTypeSchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.healthcare.applyIrmaa')} />
          <span>Apply IRMAA</span>
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Long-term care duration (years)</span>
          <input
            type="number"
            {...register('scenario.strategies.healthcare.longTermCareDurationYears', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Long-term care level</span>
          <select {...register('scenario.strategies.healthcare.longTermCareLevel')}>
            {longTermCareLevelSchema.options.map((option) => (
              <option key={option} value={option}>
                {option.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Long-term care annual expense</span>
          <input
            type="number"
            readOnly={longTermCareLevel !== 'other'}
            {...register('scenario.strategies.healthcare.longTermCareAnnualExpense', {
              valueAsNumber: true,
            })}
          />
        </label>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Declining health start age</span>
          <input
            type="number"
            {...register('scenario.strategies.healthcare.decliningHealthStartAge', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Treatment duration (years)</span>
          <input
            type="number"
            {...register('scenario.strategies.healthcare.decliningHealthTreatmentDurationYears', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Annual expense during treatment</span>
          <input
            type="number"
            {...register('scenario.strategies.healthcare.decliningHealthAnnualExpense', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Annual expense after treatment</span>
          <input
            type="number"
            {...register('scenario.strategies.healthcare.decliningHealthPostTreatmentAnnualExpense', {
              valueAsNumber: true,
            })}
          />
        </label>
      </div>
    </div>

    <div className="stack">
      <h3>Giving</h3>
      <div className="form-grid">
        <label className="field">
          <span>Annual giving</span>
          <input
            type="number"
            {...register('scenario.strategies.charitable.annualGiving', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Giving start age</span>
          <input
            type="number"
            {...register('scenario.strategies.charitable.startAge', { valueAsNumber: true })}
          />
        </label>
        <label className="field">
          <span>Giving end age</span>
          <input
            type="number"
            {...register('scenario.strategies.charitable.endAge', { valueAsNumber: true })}
          />
        </label>
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.charitable.useQcd')} />
          <span>Use QCD</span>
        </label>
        <label className="field">
          <span>QCD annual amount</span>
          <input
            type="number"
            {...register('scenario.strategies.charitable.qcdAnnualAmount', {
              valueAsNumber: true,
            })}
          />
        </label>
      </div>
    </div>

    <div className="stack">
      <div className="row">
        <h3>Events</h3>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            const today = new Date().toISOString().slice(0, 10)
            appendEvent({
              id: createUuid(),
              name: 'Event',
              date: today,
              amount: 0,
              taxTreatment: 'none',
            })
          }}
        >
          Add event
        </button>
      </div>
      {eventRows.length === 0 ? (
        <p className="muted">No events yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Tax treatment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {eventRows.map((field, index) => (
              <tr key={field.id}>
                <td>
                  <input type="hidden" {...register(`scenario.strategies.events.${index}.id`)} />
                  <input
                    defaultValue={field.name}
                    {...register(`scenario.strategies.events.${index}.name`)}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    defaultValue={field.date}
                    {...register(`scenario.strategies.events.${index}.date`)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={field.amount}
                    {...register(`scenario.strategies.events.${index}.amount`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td>
                  <select
                    defaultValue={field.taxTreatment}
                    {...register(`scenario.strategies.events.${index}.taxTreatment`)}
                  >
                    {taxTreatmentSchema.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => removeEvent(index)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </div>
)

export default SpendingSection
