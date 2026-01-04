import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  getCoreRowModel,
  useReactTable,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useAppStore } from '../../state/appStore'
import type { Scenario } from '../../core/models'
import { createUuid } from '../../core/utils/uuid'
import { createDefaultScenarioBundle } from './scenarioDefaults'
import PageHeader from '../../components/PageHeader'
import { inflationDefaultsSeed } from '../../core/defaults/defaultData'

const formatDate = (value: number) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const ScenarioListPage = () => {
  const storage = useAppStore((state) => state.storage)
  const navigate = useNavigate()
  const location = useLocation()
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [isLoading, setIsLoading] = useState(true)

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
              onClick={() => void handleRemove(row.original.id)}
            >
              Remove
            </button>
          </div>
        ),
      },
    ],
    [handleRemove, location.pathname],
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
        returnRate: 0.05,
        returnStdDev: 0.15,
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
      startAge: 67,
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
      fundingStrategyType: 'pro_rata',
      inflationAssumptions: Object.fromEntries(
        inflationDefaultsSeed.map((seed) => [seed.type, seed.rate]),
      ),
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
          <button className="button" onClick={handleCreate}>
            Create Scenario
          </button>
        }
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
