import { Link } from 'react-router-dom'
import type {
  FieldArrayWithId,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFormRegister,
} from 'react-hook-form'
import {
  inflationTypeSchema,
  taxTreatmentSchema,
  type FutureWorkStrategy,
  type InvestmentAccount,
  type NonInvestmentAccount,
  type Person,
  type PersonStrategy,
  type SocialSecurityStrategy,
} from '../../../core/models'
import type { ScenarioEditorValues } from '../scenarioEditorTypes'

type PeopleAssetsSectionProps = {
  register: UseFormRegister<ScenarioEditorValues>
  scenarioId: string | undefined
  locationPathname: string
  scenarioPersonStrategies: PersonStrategy[]
  peopleById: Map<string, Person>
  socialSecurityById: Map<string, SocialSecurityStrategy>
  futureWorkById: Map<string, FutureWorkStrategy>
  futureWorkEndByStrategyId: Map<string, string>
  onAddPersonStrategy: () => void
  onRemovePersonStrategy: (id: string) => void | Promise<void>
  availableCashAccounts: NonInvestmentAccount[]
  selectedCashAccountId: string
  onSelectCashAccount: (value: string) => void
  onAddCashAccount: () => void
  scenarioCashAccounts: NonInvestmentAccount[]
  onRemoveCashAccount: (id: string) => void | Promise<void>
  availableInvestmentAccounts: InvestmentAccount[]
  selectedInvestmentAccountId: string
  onSelectInvestmentAccount: (value: string) => void
  onAddInvestmentAccount: () => void
  scenarioInvestmentAccounts: InvestmentAccount[]
  investmentBalances: Record<string, number>
  onRemoveInvestmentAccount: (id: string) => void | Promise<void>
  appendPension: UseFieldArrayAppend<ScenarioEditorValues, 'scenario.strategies.pensions'>
  removePension: UseFieldArrayRemove
  pensionRows: FieldArrayWithId<ScenarioEditorValues, 'scenario.strategies.pensions', 'id'>[]
  stateTaxCodeOptions: Array<{ value: string; label: string }>
  formatCurrency: (value: number) => string
  getAgeInYearsAtDate: (dateOfBirth: string, dateValue: string) => number
  createUuid: () => string
}

const PeopleAssetsSection = ({
  register,
  scenarioId,
  locationPathname,
  scenarioPersonStrategies,
  peopleById,
  socialSecurityById,
  futureWorkById,
  futureWorkEndByStrategyId,
  onAddPersonStrategy,
  onRemovePersonStrategy,
  availableCashAccounts,
  selectedCashAccountId,
  onSelectCashAccount,
  onAddCashAccount,
  scenarioCashAccounts,
  onRemoveCashAccount,
  availableInvestmentAccounts,
  selectedInvestmentAccountId,
  onSelectInvestmentAccount,
  onAddInvestmentAccount,
  scenarioInvestmentAccounts,
  investmentBalances,
  onRemoveInvestmentAccount,
  appendPension,
  removePension,
  pensionRows,
  stateTaxCodeOptions,
  formatCurrency,
  getAgeInYearsAtDate,
  createUuid,
}: PeopleAssetsSectionProps) => (
  <div className="card stack" id="section-people-assets">
    <div className="row">
      <h2>People and assets</h2>
    </div>
    <div className="stack">
      <div className="row">
        <h3>People</h3>
        <button className="button secondary" type="button" onClick={onAddPersonStrategy}>
          Add person
        </button>
      </div>
      {scenarioPersonStrategies.length === 0 ? (
        <p className="muted">No person strategies yet. Create one from People.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Date of birth</th>
              <th>Work strategy</th>
              <th>Social Security start</th>
              <th>Life expectancy</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scenarioPersonStrategies.map((strategy) => {
              const person = peopleById.get(strategy.personId)
              const socialSecurity = socialSecurityById.get(strategy.socialSecurityStrategyId)
              const futureWork = futureWorkById.get(strategy.futureWorkStrategyId)
              const workEnd = futureWorkEndByStrategyId.get(strategy.futureWorkStrategyId)
              return (
                <tr key={strategy.id}>
                  <td>
                    {person ? (
                      <Link
                        className="link"
                        to={`/person-strategies/${strategy.id}`}
                        state={{ from: locationPathname, scenarioId }}
                      >
                        {person.name}
                      </Link>
                    ) : (
                      'Unknown'
                    )}
                  </td>
                  <td>{person?.dateOfBirth ?? '-'}</td>
                  <td>
                    {futureWork
                      ? `${futureWork.name} ${workEnd ? `(ends ${workEnd})` : '(does not end)'}`
                      : '-'}
                  </td>
                  <td>
                    {person && socialSecurity?.startDate
                      ? `${socialSecurity.startDate} (age ${getAgeInYearsAtDate(
                          person.dateOfBirth,
                          socialSecurity.startDate,
                        )})`
                      : '-'}
                  </td>
                  <td>{person?.lifeExpectancy ?? '-'}</td>
                  <td>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => void onRemovePersonStrategy(strategy.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>

    <div className="stack">
      <div className="row">
        <h3>Cash accounts</h3>
        <div className="button-row">
          <select
            aria-label="Add cash account"
            value={selectedCashAccountId}
            onChange={(event) => onSelectCashAccount(event.target.value)}
            disabled={availableCashAccounts.length === 0}
          >
            {availableCashAccounts.length === 0 ? (
              <option value="">No cash accounts available</option>
            ) : null}
            {availableCashAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <button
            className="button secondary"
            type="button"
            onClick={onAddCashAccount}
            disabled={!selectedCashAccountId}
          >
            Add cash account
          </button>
        </div>
      </div>
      {scenarioCashAccounts.length === 0 ? (
        <p className="muted">No cash accounts available.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Balance</th>
              <th>Interest rate</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scenarioCashAccounts.map((account) => (
              <tr key={account.id}>
                <td>
                  <Link
                    className="link"
                    to={`/accounts/cash/${account.id}`}
                    state={{ from: locationPathname }}
                  >
                    {account.name}
                  </Link>
                </td>
                <td>{formatCurrency(account.balance)}</td>
                <td>{account.interestRate}</td>
                <td>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => void onRemoveCashAccount(account.id)}
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
      <div className="row">
        <h3>Investment accounts</h3>
        <div className="button-row">
          <select
            aria-label="Add investment account"
            value={selectedInvestmentAccountId}
            onChange={(event) => onSelectInvestmentAccount(event.target.value)}
            disabled={availableInvestmentAccounts.length === 0}
          >
            {availableInvestmentAccounts.length === 0 ? (
              <option value="">No investment accounts available</option>
            ) : null}
            {availableInvestmentAccounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <button
            className="button secondary"
            type="button"
            onClick={onAddInvestmentAccount}
            disabled={!selectedInvestmentAccountId}
          >
            Add investment account
          </button>
        </div>
      </div>
      {scenarioInvestmentAccounts.length === 0 ? (
        <p className="muted">No investment accounts available.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {scenarioInvestmentAccounts.map((account) => (
              <tr key={account.id}>
                <td>
                  <Link
                    className="link"
                    to={`/accounts/investment/${account.id}`}
                    state={{ from: locationPathname }}
                  >
                    {account.name}
                  </Link>
                </td>
                <td>{formatCurrency(investmentBalances[account.id] ?? 0)}</td>
                <td>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => void onRemoveInvestmentAccount(account.id)}
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
      <div className="row">
        <h3>Pensions</h3>
        <button
          className="button secondary"
          type="button"
          onClick={() => {
            const today = new Date().toISOString().slice(0, 10)
            appendPension({
              id: createUuid(),
              name: 'Pension',
              startDate: today,
              endDate: '',
              monthlyAmount: 0,
              inflationType: 'cpi',
              taxTreatment: 'ordinary',
            })
          }}
        >
          Add pension
        </button>
      </div>
      {pensionRows.length === 0 ? (
        <p className="muted">No pensions yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Start</th>
              <th>End</th>
              <th>Monthly</th>
              <th>Inflation</th>
              <th>Tax</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pensionRows.map((field, index) => (
              <tr key={field.id}>
                <td>
                  <input
                    type="hidden"
                    {...register(`scenario.strategies.pensions.${index}.id`)}
                  />
                  <input
                    defaultValue={field.name}
                    {...register(`scenario.strategies.pensions.${index}.name`)}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    defaultValue={field.startDate}
                    {...register(`scenario.strategies.pensions.${index}.startDate`)}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    defaultValue={field.endDate ?? ''}
                    {...register(`scenario.strategies.pensions.${index}.endDate`)}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    defaultValue={field.monthlyAmount}
                    {...register(`scenario.strategies.pensions.${index}.monthlyAmount`, {
                      valueAsNumber: true,
                    })}
                  />
                </td>
                <td>
                  <select
                    defaultValue={field.inflationType}
                    {...register(`scenario.strategies.pensions.${index}.inflationType`)}
                  >
                    {inflationTypeSchema.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    defaultValue={field.taxTreatment}
                    {...register(`scenario.strategies.pensions.${index}.taxTreatment`)}
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
                    onClick={() => removePension(index)}
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
      <h3>Taxes</h3>
      <div className="form-grid">
        <label className="field">
          <span>Filing status</span>
          <select {...register('scenario.strategies.tax.filingStatus')}>
            <option value="single">Single</option>
            <option value="married_joint">Married filing jointly</option>
            <option value="married_separate">Married filing separately</option>
            <option value="head_of_household">Head of household</option>
          </select>
        </label>
        <label className="field">
          <span>Policy year</span>
          <input
            type="number"
            {...register('scenario.strategies.tax.policyYear', { valueAsNumber: true })}
          />
        </label>
        <label className="field">
          <span>State tax rate</span>
          <input
            type="number"
            step="0.001"
            {...register('scenario.strategies.tax.stateTaxRate', { valueAsNumber: true })}
          />
        </label>
        <label className="field">
          <span>State</span>
          <select {...register('scenario.strategies.tax.stateCode')}>
            {stateTaxCodeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.tax.useStandardDeduction')} />
          <span>Use standard deduction</span>
        </label>
        <label className="field checkbox">
          <input type="checkbox" {...register('scenario.strategies.tax.applyCapitalGainsRates')} />
          <span>Apply capital gains rates</span>
        </label>
      </div>
    </div>
  </div>
)

export default PeopleAssetsSection
