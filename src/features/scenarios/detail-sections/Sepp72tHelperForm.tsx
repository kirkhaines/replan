import { useMemo, useState } from 'react'
import {
  calculateSeppDistribution,
  type SeppCalculationMethod,
  type SeppTableType,
} from '../../../core/utils/sepp72tCalculator'

type Sepp72tHelperFormProps = {
  regularAge: number
  traditionalBalance: number
  formatCurrency: (value: number) => string
  onApplyAmount: (amount: number) => void
  onApplyStartAge?: (age: number) => void
}

export const Sepp72tHelperForm = ({
  regularAge,
  traditionalBalance,
  formatCurrency,
  onApplyAmount,
  onApplyStartAge,
}: Sepp72tHelperFormProps) => {
  const [ageOverride, setAgeOverride] = useState<number | null>(null)
  const [balanceOverride, setBalanceOverride] = useState<number | null>(null)
  const [method, setMethod] = useState<SeppCalculationMethod>('amortization')
  const [interestOrSinkRate, setInterestOrSinkRate] = useState<number>(5.0)
  const [tableType, setTableType] = useState<SeppTableType>('single')

  const calcAge = ageOverride ?? (regularAge > 0 ? regularAge : 50)
  const calcBalance = balanceOverride ?? (traditionalBalance > 0 ? traditionalBalance : 500000)

  const result = useMemo(
    () =>
      calculateSeppDistribution({
        age: calcAge,
        balance: calcBalance,
        method,
        interestOrSinkRate,
        tableType,
      }),
    [calcAge, calcBalance, method, interestOrSinkRate, tableType],
  )

  const interestParameterLabel = useMemo(() => {
    switch (method) {
      case 'amortization':
        return 'Interest rate (%)'
      case 'annuitization':
        return 'Interest or sink parameter (%)'
      case 'rmd':
        return 'Interest or sink parameter'
    }
  }, [method])

  return (
    <div
      className="stack"
      style={{
        gridColumn: '1 / -1',
        border: '1px solid var(--border, #333)',
        borderRadius: '8px',
        padding: '1rem',
        marginTop: '0.5rem',
      }}
    >
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h4>72(t) distribution calculator</h4>
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          IRS Notice 2022-6 guidance
        </span>
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Age at 72(t) start</span>
          <input
            type="number"
            step="0.1"
            value={calcAge || ''}
            onChange={(e) => setAgeOverride(e.target.value === '' ? 0 : Number(e.target.value))}
          />
        </label>

        <label className="field">
          <span>Traditional IRA balance at start</span>
          <input
            type="number"
            step="1000"
            value={calcBalance || ''}
            onChange={(e) => setBalanceOverride(e.target.value === '' ? 0 : Number(e.target.value))}
          />
        </label>

        <label className="field">
          <span>Calculation method</span>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as SeppCalculationMethod)}
          >
            <option value="amortization">Fixed Amortization</option>
            <option value="annuitization">Fixed Annuitization / Sinking Fund</option>
            <option value="rmd">Required Minimum Distribution (RMD)</option>
          </select>
        </label>

        <label className="field">
          <span>{interestParameterLabel}</span>
          {method === 'rmd' ? (
            <input type="text" disabled value="Not applicable for RMD" />
          ) : (
            <input
              type="number"
              step="0.01"
              value={interestOrSinkRate || ''}
              onChange={(e) =>
                setInterestOrSinkRate(e.target.value === '' ? 0 : Number(e.target.value))
              }
            />
          )}
        </label>

        <label className="field">
          <span>Life expectancy table</span>
          <select
            value={tableType}
            onChange={(e) => setTableType(e.target.value as SeppTableType)}
          >
            <option value="single">Single Life Expectancy (IRS Table I)</option>
            <option value="uniform">Uniform Lifetime (IRS Table III)</option>
          </select>
        </label>
      </div>

      {traditionalBalance > 0 && calcBalance !== traditionalBalance ? (
        <div>
          <button
            type="button"
            className="button secondary"
            style={{ fontSize: '0.8rem', padding: '0.25rem 0.5rem' }}
            onClick={() => setBalanceOverride(traditionalBalance)}
          >
            Use scenario traditional balance ({formatCurrency(traditionalBalance)})
          </button>
        </div>
      ) : null}

      <div
        className="row"
        style={{
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '0.75rem 1rem',
          background: 'var(--surface-subtle, rgba(255, 255, 255, 0.05))',
          borderRadius: '6px',
        }}
      >
        <div className="stack" style={{ gap: '0.2rem' }}>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            Calculated annual distribution ({result.methodLabel})
          </span>
          <strong style={{ fontSize: '1.25rem' }}>
            {formatCurrency(result.annualDistribution)} / yr
          </strong>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {formatCurrency(result.monthlyDistribution)} / month • Factor: {result.factorUsed} • Life exp: {result.lifeExpectancy} yrs
          </span>
        </div>

        <div className="row" style={{ gap: '0.5rem' }}>
          {calcAge !== regularAge && onApplyStartAge ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => onApplyStartAge(calcAge)}
            >
              Set start age to {calcAge}
            </button>
          ) : null}
          <button
            type="button"
            className="button secondary"
            onClick={() => onApplyAmount(result.annualDistribution)}
          >
            Apply to annual distribution
          </button>
        </div>
      </div>
    </div>
  )
}

export default Sepp72tHelperForm
