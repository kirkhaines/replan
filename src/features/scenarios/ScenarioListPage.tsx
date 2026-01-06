import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  getCoreRowModel,
  useReactTable,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useAppStore } from '../../state/appStore'
import type { Scenario } from '../../core/models'
import { createDefaultScenarioStrategies, normalizeScenarioStrategies } from '../../core/models'
import { createUuid } from '../../core/utils/uuid'
import { createDefaultScenarioBundle } from './scenarioDefaults'
import PageHeader from '../../components/PageHeader'
import { inflationDefaultsSeed } from '../../core/defaults/defaultData'
import type { LocalScenarioSeed } from '../../core/defaults/localSeedTypes'

const formatDate = (value: number) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const addYearsToIsoDate = (isoDate: string, years: number) => {
  const date = new Date(isoDate)
  date.setFullYear(date.getFullYear() + years)
  return date.toISOString().slice(0, 10)
}

const ScenarioListPage = () => {
  const storage = useAppStore((state) => state.storage)
  const navigate = useNavigate()
  const location = useLocation()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  const loadScenarios = useCallback(async () => {
    setIsLoading(true)
    const data = await storage.scenarioRepo.list()
    setScenarios(data)
    setIsLoading(false)
  }, [storage])

  useEffect(() => {
    void loadScenarios()
  }, [loadScenarios])

  const handleRemove = async (scenarioId: string) => {
    const confirmed = window.confirm('Remove this scenario?')
    if (!confirmed) {
      return
    }
    await storage.scenarioRepo.remove(scenarioId)
    await loadScenarios()
  }

  const buildLocalScenarioSeed = useCallback(
    async (scenarioId: string): Promise<LocalScenarioSeed | null> => {
      const scenario = await storage.scenarioRepo.get(scenarioId)
      if (!scenario) {
        return null
      }
      const normalizedScenario = {
        ...scenario,
        strategies: normalizeScenarioStrategies(scenario.strategies),
      }

      const personStrategies = (
        await Promise.all(
          scenario.personStrategyIds.map((id) => storage.personStrategyRepo.get(id)),
        )
      ).filter((strategy): strategy is NonNullable<typeof strategy> => Boolean(strategy))

      const people = (
        await Promise.all(
          personStrategies.map((strategy) => storage.personRepo.get(strategy.personId)),
        )
      ).filter((person): person is NonNullable<typeof person> => Boolean(person))

      const socialSecurityStrategies = (
        await Promise.all(
          personStrategies.map((strategy) =>
            storage.socialSecurityStrategyRepo.get(strategy.socialSecurityStrategyId),
          ),
        )
      ).filter((strategy): strategy is NonNullable<typeof strategy> => Boolean(strategy))

      const socialSecurityEarnings = (
        await Promise.all(
          people.map((person) => storage.socialSecurityEarningsRepo.listForPerson(person.id)),
        )
      ).flat()

      const futureWorkStrategies = (
        await Promise.all(
          personStrategies.map((strategy) =>
            storage.futureWorkStrategyRepo.get(strategy.futureWorkStrategyId),
          ),
        )
      ).filter((strategy): strategy is NonNullable<typeof strategy> => Boolean(strategy))

      const futureWorkPeriods = (
        await Promise.all(
          futureWorkStrategies.map((strategy) =>
            storage.futureWorkPeriodRepo.listForStrategy(strategy.id),
          ),
        )
      ).flat()

      const spendingStrategy = await storage.spendingStrategyRepo.get(
        scenario.spendingStrategyId,
      )
      const spendingStrategies = spendingStrategy ? [spendingStrategy] : []
      const spendingLineItems = spendingStrategy
        ? await storage.spendingLineItemRepo.listForStrategy(spendingStrategy.id)
        : []

      const nonInvestmentAccounts = (
        await Promise.all(
          scenario.nonInvestmentAccountIds.map((id) =>
            storage.nonInvestmentAccountRepo.get(id),
          ),
        )
      ).filter((account): account is NonNullable<typeof account> => Boolean(account))

      const investmentAccounts = (
        await Promise.all(
          scenario.investmentAccountIds.map((id) =>
            storage.investmentAccountRepo.get(id),
          ),
        )
      ).filter((account): account is NonNullable<typeof account> => Boolean(account))

      const investmentAccountHoldings = (
        await Promise.all(
          investmentAccounts.map((account) =>
            storage.investmentAccountHoldingRepo.listForAccount(account.id),
          ),
        )
      ).flat()

      return {
        scenario: normalizedScenario,
        people,
        personStrategies,
        socialSecurityStrategies,
        socialSecurityEarnings,
        futureWorkStrategies,
        futureWorkPeriods,
        spendingStrategies,
        spendingLineItems,
        nonInvestmentAccounts,
        investmentAccounts,
        investmentAccountHoldings,
      }
    },
    [storage],
  )

  const handleExport = useCallback(
    async (scenarioId: string) => {
      const seed = await buildLocalScenarioSeed(scenarioId)
      if (!seed) {
        return
      }
      const filenameBase = seed.scenario.name
        ? seed.scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        : seed.scenario.id
      const blob = new Blob([JSON.stringify(seed, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filenameBase || 'scenario'}.json`
      link.click()
      URL.revokeObjectURL(url)
    },
    [buildLocalScenarioSeed],
  )

  const isLocalScenarioSeed = (value: unknown): value is LocalScenarioSeed => {
    if (!value || typeof value !== 'object') {
      return false
    }
    const seed = value as LocalScenarioSeed
    return Boolean(
      seed.scenario &&
        Array.isArray(seed.people) &&
        Array.isArray(seed.personStrategies) &&
        Array.isArray(seed.socialSecurityStrategies) &&
        Array.isArray(seed.futureWorkStrategies) &&
        Array.isArray(seed.futureWorkPeriods) &&
        Array.isArray(seed.spendingStrategies) &&
        Array.isArray(seed.spendingLineItems) &&
        Array.isArray(seed.nonInvestmentAccounts) &&
        Array.isArray(seed.investmentAccounts) &&
        Array.isArray(seed.investmentAccountHoldings),
    )
  }

  const handleImportFile = async (file: File) => {
    const text = await file.text()
    const parsed = JSON.parse(text)
    if (!isLocalScenarioSeed(parsed)) {
      window.alert('Invalid scenario seed file.')
      return
    }
    await Promise.all(parsed.people.map((record) => storage.personRepo.upsert(record)))
    await Promise.all(
      parsed.socialSecurityEarnings.map((record) =>
        storage.socialSecurityEarningsRepo.upsert(record),
      ),
    )
    await Promise.all(
      parsed.socialSecurityStrategies.map((record) =>
        storage.socialSecurityStrategyRepo.upsert(record),
      ),
    )
    await Promise.all(
      parsed.futureWorkStrategies.map((record) =>
        storage.futureWorkStrategyRepo.upsert(record),
      ),
    )
    await Promise.all(
      parsed.futureWorkPeriods.map((record) =>
        storage.futureWorkPeriodRepo.upsert(record),
      ),
    )
    await Promise.all(
      parsed.spendingStrategies.map((record) =>
        storage.spendingStrategyRepo.upsert(record),
      ),
    )
    await Promise.all(
      parsed.spendingLineItems.map((record) =>
        storage.spendingLineItemRepo.upsert(record),
      ),
    )
    await Promise.all(
      parsed.nonInvestmentAccounts.map((record) =>
        storage.nonInvestmentAccountRepo.upsert(record),
      ),
    )
    await Promise.all(
      parsed.investmentAccounts.map((record) =>
        storage.investmentAccountRepo.upsert(record),
      ),
    )
    await Promise.all(
      parsed.investmentAccountHoldings.map((record) =>
        storage.investmentAccountHoldingRepo.upsert(record),
      ),
    )
    await Promise.all(
      parsed.personStrategies.map((record) =>
        storage.personStrategyRepo.upsert(record),
      ),
    )
    await storage.scenarioRepo.upsert(parsed.scenario)
    await loadScenarios()
  }

  const handleImportClick = () => {
    importInputRef.current?.click()
  }

  const columns = useMemo<ColumnDef<Scenario>[]>(
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        cell: ({ row }) => (
          <Link
            className="link"
            to={`/scenarios/${row.original.id}`}
            state={{ from: location.pathname }}
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        header: 'Updated',
        accessorKey: 'updatedAt',
        cell: (info) => formatDate(info.getValue<number>()),
      },
      {
        header: 'Actions',
        cell: ({ row }) => (
          <div className="button-row">
            <button
              className="link-button"
              type="button"
              onClick={() => void handleExport(row.original.id)}
            >
              Export
            </button>
            <button
              className="link-button"
              type="button"
              onClick={() => void handleRemove(row.original.id)}
            >
              Remove
            </button>
          </div>
        ),
      },
    ],
    [handleExport, handleRemove, location.pathname],
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: scenarios,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const handleCreate = async () => {
    const [people, cashAccounts, investmentAccounts] = await Promise.all([
      storage.personRepo.list(),
      storage.nonInvestmentAccountRepo.list(),
      storage.investmentAccountRepo.list(),
    ])

    if (people.length === 0 || cashAccounts.length === 0 || investmentAccounts.length === 0) {
      const bundle = createDefaultScenarioBundle()
      await storage.personRepo.upsert(bundle.person)
      await Promise.all(
        bundle.socialSecurityEarnings.map((record) =>
          storage.socialSecurityEarningsRepo.upsert(record),
        ),
      )
      await storage.socialSecurityStrategyRepo.upsert(bundle.socialSecurityStrategy)
      await storage.futureWorkStrategyRepo.upsert(bundle.futureWorkStrategy)
      await storage.futureWorkPeriodRepo.upsert(bundle.futureWorkPeriod)
      await storage.spendingStrategyRepo.upsert(bundle.spendingStrategy)
      await storage.spendingLineItemRepo.upsert(bundle.spendingLineItem)
      await storage.nonInvestmentAccountRepo.upsert(bundle.nonInvestmentAccount)
      await storage.investmentAccountRepo.upsert(bundle.investmentAccount)
      await storage.investmentAccountHoldingRepo.upsert(bundle.investmentAccountHolding)
      await storage.personStrategyRepo.upsert(bundle.personStrategy)
      await storage.scenarioRepo.upsert(bundle.scenario)
      await loadScenarios()
      navigate(`/scenarios/${bundle.scenario.id}`, { state: { from: location.pathname } })
      return
    }

    const now = Date.now()
    const person = people[0]
    const nonInvestmentAccount = cashAccounts[0]
    const investmentAccount = investmentAccounts[0]
    let holdings = await storage.investmentAccountHoldingRepo.listForAccount(investmentAccount.id)

    if (holdings.length === 0) {
      const holdingId = createUuid()
      const holding = {
        id: holdingId,
        name: 'S&P 500',
        taxType: 'taxable' as const,
        balance: 150000,
        contributionBasis: 150000,
        holdingType: 'sp500' as const,
        returnRate: 0.1,
        returnStdDev: 0.16,
        investmentAccountId: investmentAccount.id,
        createdAt: now,
        updatedAt: now,
      }
      await storage.investmentAccountHoldingRepo.upsert(holding)
      holdings = [holding]
    }

    const holding = holdings[0]
    const socialSecurityStrategyId = createUuid()
    const futureWorkStrategyId = createUuid()
    const futureWorkPeriodId = createUuid()
    const spendingStrategyId = createUuid()
    const spendingLineItemId = createUuid()
    const personStrategyId = createUuid()

    const today = new Date()
    const tenYears = new Date()
    tenYears.setFullYear(today.getFullYear() + 10)
    const thirtyYears = new Date()
    thirtyYears.setFullYear(today.getFullYear() + 30)
    const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)

    await storage.socialSecurityStrategyRepo.upsert({
      id: socialSecurityStrategyId,
      personId: person.id,
      startDate: addYearsToIsoDate(person.dateOfBirth, 67),
      createdAt: now,
      updatedAt: now,
    })

    await storage.futureWorkStrategyRepo.upsert({
      id: futureWorkStrategyId,
      name: 'Work plan',
      personId: person.id,
      createdAt: now,
      updatedAt: now,
    })

    await storage.futureWorkPeriodRepo.upsert({
      id: futureWorkPeriodId,
      name: 'Primary job',
      futureWorkStrategyId,
      salary: 90000,
      bonus: 5000,
      startDate: toIsoDate(today),
      endDate: toIsoDate(tenYears),
      '401kMatchPctCap': 0.05,
      '401kMatchRatio': 1,
      '401kInvestmentAccountHoldingId': holding.id,
      includesHealthInsurance: true,
      createdAt: now,
      updatedAt: now,
    })

    await storage.spendingStrategyRepo.upsert({
      id: spendingStrategyId,
      name: 'Base spending',
      createdAt: now,
      updatedAt: now,
    })

    await storage.spendingLineItemRepo.upsert({
      id: spendingLineItemId,
      name: 'Living',
      spendingStrategyId,
      category: 'Living',
      needAmount: 3000,
      wantAmount: 1000,
      startDate: toIsoDate(today),
      endDate: toIsoDate(thirtyYears),
      isPreTax: false,
      isCharitable: false,
      isWork: false,
      targetInvestmentAccountHoldingId: holding.id,
      inflationType: 'cpi',
      createdAt: now,
      updatedAt: now,
    })

    const scenario: Scenario = {
      id: createUuid(),
      name: 'New Scenario',
      createdAt: now,
      updatedAt: now,
      personStrategyIds: [personStrategyId],
      nonInvestmentAccountIds: [nonInvestmentAccount.id],
      investmentAccountIds: [investmentAccount.id],
      spendingStrategyId,
      inflationAssumptions: inflationDefaultsSeed.reduce<Scenario['inflationAssumptions']>(
        (acc, seed) => ({ ...acc, [seed.type]: seed.rate }),
        {} as Scenario['inflationAssumptions'],
      ),
      strategies: createDefaultScenarioStrategies(),
    }

    await storage.personStrategyRepo.upsert({
      id: personStrategyId,
      scenarioId: scenario.id,
      personId: person.id,
      futureWorkStrategyId,
      socialSecurityStrategyId,
      createdAt: now,
      updatedAt: now,
    })

    await storage.scenarioRepo.upsert(scenario)
    await loadScenarios()
    navigate(`/scenarios/${scenario.id}`, { state: { from: location.pathname } })
  }

  return (
    <section className="stack">
      <PageHeader
        title="Scenarios"
        subtitle="Build local-first retirement plans and run deterministic simulations."
        actions={
          <div className="button-row">
            <button className="button" onClick={handleCreate}>
              Create Scenario
            </button>
            <button className="button secondary" type="button" onClick={handleImportClick}>
              Import Scenario
            </button>
          </div>
        }
      />
      <input
        ref={importInputRef}
        className="sr-only"
        type="file"
        accept="application/json"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (!file) {
            return
          }
          void handleImportFile(file)
          event.target.value = ''
        }}
      />

      <div className="card">
        {isLoading ? (
          <p className="muted">Loading scenarios...</p>
        ) : scenarios.length === 0 ? (
          <p className="muted">No scenarios yet. Create one to get started.</p>
        ) : (
          <table className="table">
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default ScenarioListPage
