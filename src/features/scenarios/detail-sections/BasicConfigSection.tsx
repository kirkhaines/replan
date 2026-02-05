import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { inflationTypeSchema, type InflationDefault, type Scenario } from '../../../core/models'
import type { ScenarioEditorValues } from '../scenarioEditorTypes'

type BasicConfigSectionProps = {
  register: UseFormRegister<ScenarioEditorValues>
  setValue: UseFormSetValue<ScenarioEditorValues>
  errors: FieldErrors<ScenarioEditorValues>
  inflationAssumptions: Scenario['strategies']['returnModel']['inflationAssumptions'] | undefined
  inflationByType: Map<InflationDefault['type'], InflationDefault>
}

const BasicConfigSection = ({
  register,
  setValue,
  errors,
  inflationAssumptions,
  inflationByType,
}: BasicConfigSectionProps) => {
  const handleInflationChange = (type: InflationDefault['type'], value: number) => {
    setValue(`scenario.strategies.returnModel.inflationAssumptions.${type}`, value, {
      shouldDirty: true,
    })
  }

  return (
    <div className="card stack" id="section-basic-config">
      <div className="row">
        <h2>Basic config</h2>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Scenario name</span>
          <input {...register('scenario.name')} />
          {errors.scenario?.name ? (
            <span className="error">{errors.scenario.name.message}</span>
          ) : null}
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <textarea rows={3} {...register('scenario.description')} />
      </label>

      <div className="stack">
        <h3>Market</h3>
        <div className="form-grid">
          <label className="field">
            <span>Return model</span>
            <select {...register('scenario.strategies.returnModel.mode')}>
              <option value="deterministic">Deterministic</option>
              <option value="stochastic">Stochastic</option>
              <option value="historical">Historical</option>
            </select>
          </label>
          <label className="field">
            <span>Shock period</span>
            <select {...register('scenario.strategies.returnModel.sequenceModel')}>
              <option value="independent">Monthly</option>
              <option value="regime">Annual (Calendar year)</option>
            </select>
          </label>
          <label className="field">
            <span>Shock correlation</span>
            <select {...register('scenario.strategies.returnModel.correlationModel')}>
              <option value="none">Independent per holding</option>
              <option value="asset_class">Independent per asset class</option>
            </select>
          </label>
          <label className="field">
            <span>Stochastic runs</span>
            <input
              type="number"
              min={0}
              step={1}
              {...register('scenario.strategies.returnModel.stochasticRuns', {
                setValueAs: (value) => (value === '' ? 0 : Number(value)),
              })}
            />
          </label>
          <label className="field">
            <span>Return seed</span>
            <input
              type="number"
              {...register('scenario.strategies.returnModel.seed', {
                setValueAs: (value) => (value === '' ? undefined : Number(value)),
              })}
            />
          </label>
          <label className="field">
            <span>Volatility scale</span>
            <input
              type="number"
              step="0.01"
              {...register('scenario.strategies.returnModel.volatilityScale', {
                valueAsNumber: true,
              })}
            />
          </label>
          {inflationTypeSchema.options.map((type) => {
            const currentValue =
              inflationAssumptions?.[type] ?? inflationByType.get(type)?.rate ?? 0
            return (
              <label className="field" key={type}>
                <span>{type} inflation</span>
                <input
                  type="number"
                  step="0.001"
                  value={currentValue}
                  onChange={(event) => handleInflationChange(type, Number(event.target.value))}
                />
              </label>
            )
          })}
          <label className="field">
            <span>Inflation stdev</span>
            <input
              type="number"
              step="0.001"
              {...register('scenario.strategies.returnModel.inflationStdev', {
                valueAsNumber: true,
              })}
            />
          </label>
        </div>
      </div>

    </div>
  )
}

export default BasicConfigSection
