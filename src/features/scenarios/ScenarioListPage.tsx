import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  getCoreRowModel,
  useReactTable,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { useAppStore } from '../../state/appStore'
import type { Scenario } from '../../core/models'
import { createDefaultScenarioBundle } from './scenarioDefaults'
import PageHeader from '../../components/PageHeader'

const formatDate = (value: number) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

const ScenarioListPage = () => {
  const storage = useAppStore((state) => state.storage)
  const navigate = useNavigate()
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

  const columns = useMemo<ColumnDef<Scenario>[]>(
    () => [
      { header: 'Name', accessorKey: 'name' },
      {
        header: 'Updated',
        accessorKey: 'updatedAt',
        cell: (info) => formatDate(info.getValue<number>()),
      },
      {
        header: 'Actions',
        cell: ({ row }) => (
          <Link className="link" to={`/scenarios/${row.original.id}`}>
            Open
          </Link>
        ),
      },
    ],
    [],
  )

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: scenarios,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  const handleCreate = async () => {
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
    navigate(`/scenarios/${bundle.scenario.id}`)
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
