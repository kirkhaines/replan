import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import type {
  Scenario,
  SocialSecurityEarnings,
  SpendingLineItem,
  SsaBendPoint,
  SsaRetirementAdjustment,
  SsaWageIndex,
  FutureWorkPeriod,
  FutureWorkStrategy,
  Person,
  PersonStrategy,
  SocialSecurityStrategy,
} from '../../core/models'
import { useAppStore } from '../../state/appStore'
import { createUuid } from '../../core/utils/uuid'
import PageHeader from '../../components/PageHeader'
import { applyInflation } from '../../core/utils/inflation'
import { buildSsaEstimate } from '../../core/sim/ssa'

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)
const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const addMonthsToIsoDate = (isoDate: string, months: number) => {
  const date = new Date(isoDate)
  date.setMonth(date.getMonth() + months)
  return toIsoDate(date)
}

const getAgeInYearsAtDate = (dateOfBirth: string, dateValue: string) => {
  const birth = new Date(dateOfBirth)
  const target = new Date(dateValue)
  let months =
    (target.getFullYear() - birth.getFullYear()) * 12 +
    (target.getMonth() - birth.getMonth())
  if (target.getDate() < birth.getDate()) {
    months -= 1
  }
  return Math.max(0, Math.round((months / 12) * 10) / 10)
}

const getStartDateFromAge = (dateOfBirth: string, ageYears: number) => {
  const months = Math.round(ageYears * 12)
  return addMonthsToIsoDate(dateOfBirth, months)
}

const PersonStrategyDetailPage = () => {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const locationState = location.state as { from?: string; scenarioId?: string } | null
  const backTo = locationState?.from ?? '/scenarios'
  const scenarioIdFromState = locationState?.scenarioId
  const storage = useAppStore((state) => state.storage)
  const [personStrategy, setPersonStrategy] = useState<PersonStrategy | null>(null)
  const [scenario, setScenario] = useState<Scenario | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [ssaEarnings, setSsaEarnings] = useState<SocialSecurityEarnings[]>([])
  const [spendingLineItems, setSpendingLineItems] = useState<SpendingLineItem[]>([])
  const [ssaWageIndex, setSsaWageIndex] = useState<SsaWageIndex[]>([])
  const [ssaBendPoints, setSsaBendPoints] = useState<SsaBendPoint[]>([])
  const [retirementAdjustments, setRetirementAdjustments] = useState<SsaRetirementAdjustment[]>([])
  const [socialStrategies, setSocialStrategies] = useState<SocialSecurityStrategy[]>([])
  const [futureWorkStrategies, setFutureWorkStrategies] = useState<FutureWorkStrategy[]>([])
  const [futureWorkPeriods, setFutureWorkPeriods] = useState<FutureWorkPeriod[]>([])
  const [holdingsAvailable, setHoldingsAvailable] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState('')
  const [selectedSocialId, setSelectedSocialId] = useState('')
  const [selectedFutureWorkId, setSelectedFutureWorkId] = useState('')
  const [socialDraft, setSocialDraft] = useState<SocialSecurityStrategy | null>(null)
  const [futureWorkDraft, setFutureWorkDraft] = useState<FutureWorkStrategy | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId],
  )

  const filteredSocialStrategies = useMemo(
    () => socialStrategies.filter((strategy) => strategy.personId === selectedPersonId),
    [socialStrategies, selectedPersonId],
  )

  const filteredFutureWorkStrategies = useMemo(
    () => futureWorkStrategies.filter((strategy) => strategy.personId === selectedPersonId),
    [futureWorkStrategies, selectedPersonId],
  )

  const loadPeriods = useCallback(
    async (strategyId: string) => {
      if (!strategyId) {
        setFutureWorkPeriods([])
        return
      }
      const periods = await storage.futureWorkPeriodRepo.listForStrategy(strategyId)
      setFutureWorkPeriods(periods)
    },
    [storage],
  )

  const refreshStrategies = useCallback(async () => {
    const [socialList, futureList] = await Promise.all([
      storage.socialSecurityStrategyRepo.list(),
      storage.futureWorkStrategyRepo.list(),
    ])
    setSocialStrategies(socialList)
    setFutureWorkStrategies(futureList)
    return { socialList, futureList }
  }, [storage])

  const loadData = useCallback(async () => {
    if (!id) {
      setPersonStrategy(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setError(null)
    const [
      strategy,
      peopleList,
      socialList,
      futureList,
      holdings,
      wageIndex,
      bendPoints,
      adjustmentList,
    ] = await Promise.all([
      storage.personStrategyRepo.get(id),
      storage.personRepo.list(),
      storage.socialSecurityStrategyRepo.list(),
      storage.futureWorkStrategyRepo.list(),
      storage.investmentAccountHoldingRepo.list(),
      storage.ssaWageIndexRepo.list(),
      storage.ssaBendPointRepo.list(),
      storage.ssaRetirementAdjustmentRepo.list(),
    ])

    setPeople(peopleList)
    setHoldingsAvailable(holdings.length > 0)
    setSsaWageIndex(wageIndex)
    setSsaBendPoints(bendPoints)
    setRetirementAdjustments(adjustmentList)
    setSocialStrategies(socialList)
    setFutureWorkStrategies(futureList)

    if (!strategy) {
      setPersonStrategy(null)
      setIsLoading(false)
      return
    }

    let resolvedStrategy = strategy
    if (!resolvedStrategy.scenarioId && scenarioIdFromState) {
      const now = Date.now()
      resolvedStrategy = { ...resolvedStrategy, scenarioId: scenarioIdFromState, updatedAt: now }
      await storage.personStrategyRepo.upsert(resolvedStrategy)
    }

    setPersonStrategy(resolvedStrategy)
    setSelectedPersonId(resolvedStrategy.personId)
    setSelectedSocialId(resolvedStrategy.socialSecurityStrategyId)
    setSelectedFutureWorkId(resolvedStrategy.futureWorkStrategyId)

    const social =
      socialList.find((item) => item.id === resolvedStrategy.socialSecurityStrategyId) ?? null
    const future =
      futureList.find((item) => item.id === resolvedStrategy.futureWorkStrategyId) ??
      null
    setSocialDraft(social)
    setFutureWorkDraft(future)
    await loadPeriods(resolvedStrategy.futureWorkStrategyId)

    const scenarioId = resolvedStrategy.scenarioId ?? scenarioIdFromState
    if (!scenarioId) {
      setScenario(null)
      setSsaEarnings([])
      setSpendingLineItems([])
      setError('This person strategy is not linked to a scenario yet.')
      setIsLoading(false)
      return
    }

    const scenarioRecord = await storage.scenarioRepo.get(scenarioId)
    setScenario(scenarioRecord ?? null)

    const [earnings, lineItems] = await Promise.all([
      storage.socialSecurityEarningsRepo.listForPerson(resolvedStrategy.personId),
      scenarioRecord
        ? storage.spendingLineItemRepo.listForStrategy(scenarioRecord.spendingStrategyId)
        : Promise.resolve([]),
    ])
    setSsaEarnings(earnings)
    setSpendingLineItems(lineItems)
    setIsLoading(false)
  }, [id, loadPeriods, scenarioIdFromState, storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
  }, [loadData])

  const handlePersonChange = async (personId: string) => {
    setSelectedPersonId(personId)
    setSelectedSocialId('')
    setSelectedFutureWorkId('')
    setSocialDraft(null)
    setFutureWorkDraft(null)
    setFutureWorkPeriods([])
    setSsaEarnings([])

    const nextSocial = socialStrategies.find(
      (strategy) => strategy.personId === personId,
    )
    const nextFuture = futureWorkStrategies.find(
      (strategy) => strategy.personId === personId,
    )

    if (nextSocial) {
      setSelectedSocialId(nextSocial.id)
      setSocialDraft(nextSocial)
    }

    if (nextFuture) {
      setSelectedFutureWorkId(nextFuture.id)
      setFutureWorkDraft(nextFuture)
      await loadPeriods(nextFuture.id)
    }

    if (personId) {
      const earnings = await storage.socialSecurityEarningsRepo.listForPerson(personId)
      setSsaEarnings(earnings)
    }

    setPersonStrategy((current) =>
      current
        ? {
            ...current,
            personId,
            socialSecurityStrategyId: nextSocial?.id ?? current.socialSecurityStrategyId,
            futureWorkStrategyId: nextFuture?.id ?? current.futureWorkStrategyId,
          }
        : current,
    )
  }

  const handleSocialSelect = (strategyId: string) => {
    setSelectedSocialId(strategyId)
    const strategy = socialStrategies.find((item) => item.id === strategyId) ?? null
    setSocialDraft(strategy)
    setPersonStrategy((current) =>
      current ? { ...current, socialSecurityStrategyId: strategyId } : current,
    )
  }

  const handleFutureWorkSelect = async (strategyId: string) => {
    setSelectedFutureWorkId(strategyId)
    const strategy = futureWorkStrategies.find((item) => item.id === strategyId) ?? null
    setFutureWorkDraft(strategy)
    await loadPeriods(strategyId)
    setPersonStrategy((current) =>
      current ? { ...current, futureWorkStrategyId: strategyId } : current,
    )
  }

  const handleAddSocialStrategy = async () => {
    if (!selectedPersonId || !selectedPerson) {
      setError('Select a person before adding a Social Security strategy.')
      return
    }
    const now = Date.now()
    const strategy: SocialSecurityStrategy = {
      id: createUuid(),
      personId: selectedPersonId,
      startDate: getStartDateFromAge(selectedPerson.dateOfBirth, 67),
      createdAt: now,
      updatedAt: now,
    }
    await storage.socialSecurityStrategyRepo.upsert(strategy)
    await refreshStrategies()
    setSelectedSocialId(strategy.id)
    setSocialDraft(strategy)
    setPersonStrategy((current) =>
      current ? { ...current, socialSecurityStrategyId: strategy.id } : current,
    )
  }

  const handleAddFutureWorkStrategy = async () => {
    if (!selectedPersonId) {
      setError('Select a person before adding a future work strategy.')
      return
    }
    const now = Date.now()
    const strategy: FutureWorkStrategy = {
      id: createUuid(),
      personId: selectedPersonId,
      name: 'Work plan',
      createdAt: now,
      updatedAt: now,
    }
    await storage.futureWorkStrategyRepo.upsert(strategy)
    await refreshStrategies()
    setSelectedFutureWorkId(strategy.id)
    setFutureWorkDraft(strategy)
    await loadPeriods(strategy.id)
    setPersonStrategy((current) =>
      current ? { ...current, futureWorkStrategyId: strategy.id } : current,
    )
  }

  const handleSaveSocial = async () => {
    if (!socialDraft) {
      return
    }
    const now = Date.now()
    const next = { ...socialDraft, updatedAt: now }
    await storage.socialSecurityStrategyRepo.upsert(next)
    setSocialDraft(next)
    await refreshStrategies()
  }

  const handleSaveFutureWork = async () => {
    if (!futureWorkDraft) {
      return
    }
    const now = Date.now()
    const next = { ...futureWorkDraft, updatedAt: now }
    await storage.futureWorkStrategyRepo.upsert(next)
    setFutureWorkDraft(next)
    await refreshStrategies()
  }

  const handleAddPeriod = async () => {
    if (!selectedFutureWorkId) {
      setError('Select a future work strategy before adding a period.')
      return
    }
    if (!holdingsAvailable) {
      setError('Create an investment account holding before adding a work period.')
      return
    }
    const holdings = await storage.investmentAccountHoldingRepo.list()
    const holdingId = holdings[0]?.id
    if (!holdingId) {
      setError('Create an investment account holding before adding a work period.')
      return
    }
    const now = Date.now()
    const start = new Date()
    const end = new Date()
    end.setFullYear(start.getFullYear() + 1)
    const period: FutureWorkPeriod = {
      id: createUuid(),
      name: 'Work period',
      futureWorkStrategyId: selectedFutureWorkId,
      salary: 80000,
      bonus: 0,
      startDate: toIsoDate(start),
      endDate: toIsoDate(end),
      '401kContributionType': 'fixed',
      '401kContributionAnnual': 0,
      '401kContributionPct': 0,
      '401kMatchPctCap': 0.05,
      '401kMatchRatio': 1,
      '401kInvestmentAccountHoldingId': holdingId,
      '401kEmployerMatchHoldingId': holdingId,
      'hsaContributionAnnual': 0,
      'hsaEmployerContributionAnnual': 0,
      'hsaUseMaxLimit': false,
      'hsaInvestmentAccountHoldingId': null,
      includesHealthInsurance: true,
      createdAt: now,
      updatedAt: now,
    }
    await storage.futureWorkPeriodRepo.upsert(period)
    await loadPeriods(selectedFutureWorkId)
  }

  const handleRemovePeriod = async (periodId: string) => {
    const confirmed = window.confirm('Remove this work period?')
    if (!confirmed) {
      return
    }
    await storage.futureWorkPeriodRepo.remove(periodId)
    await loadPeriods(selectedFutureWorkId)
  }

  const handleSavePersonStrategy = async () => {
    if (!personStrategy) {
      return
    }
    if (!selectedPersonId || !selectedSocialId || !selectedFutureWorkId) {
      setError('Select a person, Social Security strategy, and future work strategy.')
      return
    }
    const now = Date.now()
    const next: PersonStrategy = {
      ...personStrategy,
      personId: selectedPersonId,
      socialSecurityStrategyId: selectedSocialId,
      futureWorkStrategyId: selectedFutureWorkId,
      updatedAt: now,
    }
    await storage.personStrategyRepo.upsert(next)
    setPersonStrategy(next)
  }

  const socialSecurityEstimate = useMemo(() => {
    if (!socialDraft || !scenario || !selectedPersonId) {
      return null
    }
    const person = people.find((item) => item.id === selectedPersonId)
    if (!person) {
      return null
    }
    return buildSsaEstimate({
      person,
      socialStrategy: socialDraft,
      scenario,
      earnings: ssaEarnings,
      futureWorkPeriods,
      spendingLineItems,
      wageIndex: ssaWageIndex,
      bendPoints: ssaBendPoints,
      retirementAdjustments,
    })
  }, [
    socialDraft,
    scenario,
    selectedPersonId,
    people,
    ssaEarnings,
    futureWorkPeriods,
    spendingLineItems,
    ssaWageIndex,
    ssaBendPoints,
    retirementAdjustments,
  ])

  const socialStartAge = useMemo(() => {
    if (!socialDraft || !selectedPerson) {
      return null
    }
    return getAgeInYearsAtDate(selectedPerson.dateOfBirth, socialDraft.startDate)
  }, [selectedPerson, socialDraft])

  const presentDayBenefit = useMemo(() => {
    if (!socialSecurityEstimate?.details || !scenario) {
      return null
    }
    const cpiRate = scenario.strategies.returnModel.inflationAssumptions.cpi ?? 0
    return applyInflation({
      amount: socialSecurityEstimate.monthlyBenefit,
      inflationType: 'cpi',
      fromDateIso: `${socialSecurityEstimate.details.claimYear}-01-01`,
      toDateIso: new Date().toISOString().slice(0, 10),
      rateOverride: cpiRate,
    })
  }, [scenario, socialSecurityEstimate])

  if (isLoading) {
    return <p className="muted">Loading person strategy...</p>
  }

  if (!personStrategy) {
    return (
      <section className="stack">
        <h1>Person strategy not found</h1>
        <Link className="link" to={backTo}>
          Back to scenarios
        </Link>
      </section>
    )
  }

  return (
    <section className="stack">
      <PageHeader
        title="Person strategy"
        subtitle="Choose a person and link work and Social Security strategies."
        actions={
          <Link className="link" to={backTo}>
            Back
          </Link>
        }
      />

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card stack">
        <h2>Person</h2>
        <label className="field">
          <span>Person</span>
          <select value={selectedPersonId} onChange={(event) => void handlePersonChange(event.target.value)}>
            {people.length === 0 ? <option value="">No people available</option> : null}
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>

        <div className="stack">
          <h2>Social Security strategy</h2>
          <div className="row">
            <label className="field">
              <span>Social Security strategy</span>
              <select
                value={selectedSocialId}
                onChange={(event) => handleSocialSelect(event.target.value)}
              >
                {filteredSocialStrategies.length === 0 ? (
                  <option value="">No Social Security strategies</option>
                ) : null}
                {filteredSocialStrategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.startDate && selectedPerson
                      ? `Start ${strategy.startDate} (age ${getAgeInYearsAtDate(
                          selectedPerson.dateOfBirth,
                          strategy.startDate,
                        )})`
                      : 'Start date not set'}
                  </option>
                ))}
              </select>
            </label>
            <button className="button secondary" type="button" onClick={handleAddSocialStrategy}>
              Add Social Security strategy
            </button>
          </div>

          {socialDraft ? (
            <div className="stack">
              <div className="form-grid">
                <label className="field">
                  <span>Start date</span>
                  <input
                    type="date"
                    value={socialDraft.startDate}
                    onChange={(event) =>
                      setSocialDraft({ ...socialDraft, startDate: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Start age</span>
                  <input
                    type="number"
                    value={socialStartAge ?? ''}
                    onChange={(event) => {
                      if (!selectedPerson) {
                        return
                      }
                      const nextAge = Number(event.target.value)
                      if (Number.isNaN(nextAge)) {
                        return
                      }
                      setSocialDraft({
                        ...socialDraft,
                        startDate: getStartDateFromAge(selectedPerson.dateOfBirth, nextAge),
                      })
                    }}
                  />
                </label>
                <label className="field">
                  <span>Estimated monthly benefit (present-day dollars)</span>
                  <input
                    readOnly
                    value={
                      presentDayBenefit !== null
                        ? formatCurrency(presentDayBenefit)
                        : ''
                    }
                  />
                </label>
                {socialSecurityEstimate ? (
                  <label className="field">
                    <span>Benefit details</span>
                    <Link
                      className="button secondary"
                      to={`/person-strategies/${personStrategy.id}/ssa-benefit`}
                      state={{ from: location.pathname }}
                    >
                      View calculation
                    </Link>
                  </label>
                ) : null}
              </div>
              <div className="button-row">
                <button className="button" type="button" onClick={handleSaveSocial}>
                  Save Social Security
                </button>
              </div>
            </div>
          ) : (
            <p className="muted">Select a Social Security strategy to edit.</p>
          )}
        </div>

        <div className="stack">
          <h2>Future work strategy</h2>
          <div className="row">
            <label className="field">
              <span>Future work strategy</span>
              <select
                value={selectedFutureWorkId}
                onChange={(event) => void handleFutureWorkSelect(event.target.value)}
              >
                {filteredFutureWorkStrategies.length === 0 ? (
                  <option value="">No future work strategies</option>
                ) : null}
                {filteredFutureWorkStrategies.map((strategy) => (
                  <option key={strategy.id} value={strategy.id}>
                    {strategy.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="button secondary" type="button" onClick={handleAddFutureWorkStrategy}>
              Add future work strategy
            </button>
          </div>

          {futureWorkDraft ? (
            <div className="stack">
              <div className="form-grid">
                <label className="field">
                  <span>Name</span>
                  <input
                    value={futureWorkDraft.name}
                    onChange={(event) =>
                      setFutureWorkDraft({ ...futureWorkDraft, name: event.target.value })
                    }
                  />
                </label>
              </div>

              <div className="stack">
                <div className="row">
                  <h3 className="muted">Future work periods</h3>
                  <button className="button secondary" type="button" onClick={handleAddPeriod}>
                    Add period
                  </button>
                </div>
                {futureWorkPeriods.length === 0 ? (
                  <p className="muted">No work periods yet.</p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Salary</th>
                        <th>Bonus</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {futureWorkPeriods.map((period) => (
                        <tr key={period.id}>
                          <td>
                            <Link
                              className="link"
                              to={`/future-work-periods/${period.id}`}
                              state={{ from: location.pathname }}
                            >
                              {period.name}
                            </Link>
                          </td>
                          <td>{period.salary}</td>
                          <td>{period.bonus}</td>
                          <td>{period.startDate}</td>
                          <td>{period.endDate}</td>
                          <td>
                            <button
                              className="link-button"
                              type="button"
                              onClick={() => void handleRemovePeriod(period.id)}
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
              <div className="button-row">
                <button className="button" type="button" onClick={handleSaveFutureWork}>
                  Save work strategy
                </button>
              </div>
            </div>
          ) : (
            <p className="muted">Select a future work strategy to edit.</p>
          )}
        </div>

        <div className="button-row">
          <button className="button" type="button" onClick={handleSavePersonStrategy}>
            Save person strategy
          </button>
        </div>
      </div>
    </section>
  )
}

export default PersonStrategyDetailPage
