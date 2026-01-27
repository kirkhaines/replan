import type {
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFormRegister,
} from 'react-hook-form'
import { funeralDispositionSchema } from '../../../core/models'
import type { ScenarioEditorValues } from '../scenarioEditorTypes'

type LegacySectionProps = {
  register: UseFormRegister<ScenarioEditorValues>
  deathEnabled: boolean
  appendBeneficiary: UseFieldArrayAppend<
    ScenarioEditorValues,
    'scenario.strategies.death.beneficiaries'
  >
  removeBeneficiary: UseFieldArrayRemove
  beneficiaryRows: FieldArrayWithId<
    ScenarioEditorValues,
    'scenario.strategies.death.beneficiaries',
    'id'
  >[]
  beneficiaryRelationshipOptions: Array<{ value: string; label: string }>
  stateTaxCodeOptions: Array<{ value: string; label: string }>
  createUuid: () => string
}

const LegacySection = ({
  register,
  deathEnabled,
  appendBeneficiary,
  removeBeneficiary,
  beneficiaryRows,
  beneficiaryRelationshipOptions,
  stateTaxCodeOptions,
  createUuid,
}: LegacySectionProps) => (
  <div className="card stack" id="section-legacy">
    <div className="row">
      <h2>Legacy</h2>
    </div>

    <div className="stack">
      <h3>Final expenses</h3>
      <div className="form-grid">
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.death.enabled')} />
          <span>Enable final expenses modeling</span>
        </label>
        <label className="field">
          <span>Funeral option</span>
          <select
            {...register('scenario.strategies.death.funeralDisposition')}
            disabled={!deathEnabled}
          >
            {funeralDispositionSchema.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Funeral cost override</span>
          <input
            type="number"
            disabled={!deathEnabled}
            {...register('scenario.strategies.death.funeralCostOverride', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Estate tax exemption</span>
          <input
            type="number"
            disabled={!deathEnabled}
            {...register('scenario.strategies.death.estateTaxExemption', {
              valueAsNumber: true,
            })}
          />
        </label>
        <label className="field">
          <span>Estate tax rate</span>
          <input
            type="number"
            step="0.01"
            disabled={!deathEnabled}
            {...register('scenario.strategies.death.estateTaxRate', { valueAsNumber: true })}
          />
        </label>
        <label className="field checkbox">
          <input
            type="checkbox"
            disabled={!deathEnabled}
            {...register('scenario.strategies.death.taxableStepUp')}
          />
          <span>Step-up basis for taxable holdings</span>
        </label>
      </div>
    </div>

    <div className="stack">
      <div className="row">
        <h3>Beneficiaries</h3>
        <button
          className="button secondary"
          type="button"
          disabled={!deathEnabled}
          onClick={() =>
            appendBeneficiary({
              id: createUuid(),
              name: 'Beneficiary',
              sharePct: 1,
              stateOfResidence: 'none',
              relationship: 'child',
              assumedOrdinaryRate: 0.22,
              assumedCapitalGainsRate: 0.15,
            })
          }
        >
          Add beneficiary
        </button>
      </div>
      {beneficiaryRows.length === 0 ? (
        <p className="muted">No beneficiaries yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Relationship</th>
              <th>Share</th>
              <th>State of residence</th>
              <th>Assumed ordinary rate</th>
              <th>Assumed cap gains rate</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {beneficiaryRows.map((field, index) => (
              <tr key={field.id}>
                <td>
                  <input
                    type="hidden"
                    {...register(`scenario.strategies.death.beneficiaries.${index}.id`)}
                  />
                  <input
                    defaultValue={field.name}
                    disabled={!deathEnabled}
                    {...register(`scenario.strategies.death.beneficiaries.${index}.name`)}
                  />
                </td>
                <td>
                  <select
                    defaultValue={field.relationship ?? 'child'}
                    disabled={!deathEnabled}
                    {...register(`scenario.strategies.death.beneficiaries.${index}.relationship`)}
                  >
                    {beneficiaryRelationshipOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={field.sharePct}
                    disabled={!deathEnabled}
                    {...register(`scenario.strategies.death.beneficiaries.${index}.sharePct`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td>
                  <select
                    defaultValue={field.stateOfResidence ?? 'none'}
                    disabled={!deathEnabled}
                    {...register(
                      `scenario.strategies.death.beneficiaries.${index}.stateOfResidence`,
                    )}
                  >
                    {stateTaxCodeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={field.assumedOrdinaryRate}
                    disabled={!deathEnabled}
                    {...register(
                      `scenario.strategies.death.beneficiaries.${index}.assumedOrdinaryRate`,
                      { valueAsNumber: true },
                    )}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={field.assumedCapitalGainsRate}
                    disabled={!deathEnabled}
                    {...register(
                      `scenario.strategies.death.beneficiaries.${index}.assumedCapitalGainsRate`,
                      { valueAsNumber: true },
                    )}
                  />
                </td>
                <td>
                  <button
                    className="link-button"
                    type="button"
                    disabled={!deathEnabled}
                    onClick={() => removeBeneficiary(index)}
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

export default LegacySection
