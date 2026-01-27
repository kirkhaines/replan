import type {
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFormRegister,
} from 'react-hook-form'
import type { ScenarioEditorValues } from '../scenarioEditorTypes'

type AssetManagementSectionProps = {
  register: UseFormRegister<ScenarioEditorValues>
  withdrawalOrderOptions: Array<{ value: string; label: string }>
  glidepathTargetFields: FieldArrayWithId<
    ScenarioEditorValues,
    'scenario.strategies.glidepath.targets',
    'id'
  >[]
  appendGlidepathTarget: UseFieldArrayAppend<
    ScenarioEditorValues,
    'scenario.strategies.glidepath.targets'
  >
  removeGlidepathTarget: UseFieldArrayRemove
}

const AssetManagementSection = ({
  register,
  withdrawalOrderOptions,
  glidepathTargetFields,
  appendGlidepathTarget,
  removeGlidepathTarget,
}: AssetManagementSectionProps) => (
  <div className="card stack" id="section-asset-management">
    <div className="row">
      <h2>Asset management</h2>
    </div>
    <div className="stack">
      <h3>Allocation</h3>
      <div className="form-grid">
        <label className="field">
          <span>Glidepath mode</span>
          <select {...register('scenario.strategies.glidepath.mode')}>
            <option value="age">Age</option>
            <option value="year">Year</option>
          </select>
        </label>
        <label className="field">
          <span>Glidepath scope</span>
          <select {...register('scenario.strategies.glidepath.scope')}>
            <option value="global">Global</option>
          </select>
        </label>
      </div>
    </div>

    <div className="stack">
      <div className="row">
        <h3>Glidepath targets</h3>
        <button
          className="button secondary"
          type="button"
          onClick={() =>
            appendGlidepathTarget({
              age: 65,
              equity: 0.6,
              bonds: 0.35,
              realEstate: 0.05,
              other: 0,
            })
          }
        >
          Add target
        </button>
      </div>
      {glidepathTargetFields.length === 0 ? (
        <p className="muted">No glidepath targets yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Age</th>
              <th>Equity</th>
              <th>Bonds</th>
              <th>Cash</th>
              <th>Real estate</th>
              <th>Other</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {glidepathTargetFields.map((field, index) => (
              <tr key={field.id}>
                <td>
                  <input
                    type="number"
                    defaultValue={field.age}
                    {...register(`scenario.strategies.glidepath.targets.${index}.age`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={field.equity}
                    {...register(`scenario.strategies.glidepath.targets.${index}.equity`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={field.bonds}
                    {...register(`scenario.strategies.glidepath.targets.${index}.bonds`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td>
                  <span className="muted">Using cash buffer</span>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={field.realEstate}
                    {...register(`scenario.strategies.glidepath.targets.${index}.realEstate`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={field.other}
                    {...register(`scenario.strategies.glidepath.targets.${index}.other`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => removeGlidepathTarget(index)}
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

    <div className="stack">
      <h3>Rebalancing</h3>
      <div className="form-grid">
        <label className="field">
          <span>Rebalance frequency</span>
          <select {...register('scenario.strategies.rebalancing.frequency')}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
            <option value="threshold">Threshold</option>
          </select>
        </label>
        <label className="field">
          <span>Drift threshold</span>
          <input
            type="number"
            step="0.01"
            {...register('scenario.strategies.rebalancing.driftThreshold', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Min trade amount</span>
          <input
            type="number"
            {...register('scenario.strategies.rebalancing.minTradeAmount', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            {...register('scenario.strategies.rebalancing.useContributions')}
          />
          <span>Use contributions first</span>
        </label>
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.rebalancing.taxAware')} />
          <span>Tax aware</span>
        </label>
      </div>
    </div>

    <div className="stack">
      <h3>Cash buffer</h3>
      <div className="form-grid">
        <label className="field">
          <span>Cash buffer target (months)</span>
          <input
            type="number"
            {...register('scenario.strategies.cashBuffer.targetMonths', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.withdrawal.useCashFirst')} />
          <span>Use cash first</span>
        </label>
        <label className="field">
          <span>Cash buffer min (months)</span>
          <input
            type="number"
            {...register('scenario.strategies.cashBuffer.minMonths', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Cash buffer max (months)</span>
          <input
            type="number"
            {...register('scenario.strategies.cashBuffer.maxMonths', {
              valueAsNumber: true,
            })}
          />
        </label>
      </div>
    </div>

    <div className="stack">
      <h3>Withdrawal order</h3>
      <div className="form-grid">
        <label className="field">
          <span>Withdrawal order 1</span>
          <select {...register('scenario.strategies.withdrawal.order.0')}>
            {withdrawalOrderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Withdrawal order 2</span>
          <select {...register('scenario.strategies.withdrawal.order.1')}>
            {withdrawalOrderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Withdrawal order 3</span>
          <select {...register('scenario.strategies.withdrawal.order.2')}>
            {withdrawalOrderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Withdrawal order 4</span>
          <select {...register('scenario.strategies.withdrawal.order.3')}>
            {withdrawalOrderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Withdrawal order 5</span>
          <select {...register('scenario.strategies.withdrawal.order.4')}>
            {withdrawalOrderOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>

    <div className="stack">
      <h3>Withdrawal guardrails</h3>
      <div className="form-grid">
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.withdrawal.avoidEarlyPenalty')} />
          <span>Avoid early penalties</span>
        </label>
        <label className="field">
          <span>Guardrail percent</span>
          <input
            type="number"
            step="0.01"
            {...register('scenario.strategies.withdrawal.guardrailPct', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Taxable gain harvest target</span>
          <input
            type="number"
            {...register('scenario.strategies.withdrawal.taxableGainHarvestTarget', {
              valueAsNumber: true,
            })}
          />
        </label>
      </div>
    </div>

    <div className="stack">
      <h3>Taxable lots</h3>
      <div className="form-grid">
        <label className="field">
          <span>Cost basis method</span>
          <select {...register('scenario.strategies.taxableLot.costBasisMethod')}>
            <option value="average">Average</option>
            <option value="fifo">FIFO</option>
            <option value="lifo">LIFO</option>
          </select>
        </label>
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.taxableLot.harvestLosses')} />
          <span>Harvest losses</span>
        </label>
        <label className="field">
          <span>Gain realization target</span>
          <input
            type="number"
            {...register('scenario.strategies.taxableLot.gainRealizationTarget', {
              valueAsNumber: true,
            })}
          />
        </label>
      </div>
    </div>
  </div>
)

export default AssetManagementSection
