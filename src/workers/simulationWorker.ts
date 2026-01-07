/// <reference lib="webworker" />
import { runSimulation } from '../core/sim/engine'
import {
  buildSimulationInputFromRequest,
  simulationRequestSchema,
} from '../core/sim/input'
import type { RunScenarioRequest, RunScenarioResponse } from '../core/simClient/types'
import { createUuid } from '../core/utils/uuid'
import type { ZodIssue } from 'zod'

const emptyResult = {
  timeline: [],
  summary: { endingBalance: 0, minBalance: 0, maxBalance: 0 },
}

const formatZodError = (issue?: ZodIssue) => {
  const message = issue?.message ?? 'Unknown error'
  const path = issue?.path?.length ? issue.path.join('.') : ''
  return path ? `Invalid scenario at ${path}: ${message}` : `Invalid scenario: ${message}`
}

const summarizeSnapshot = (snapshot?: { [key: string]: unknown }) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return 'snapshot missing'
  }
  const getCount = (value: unknown) => (Array.isArray(value) ? value.length : 0)
  const data = snapshot as {
    scenario?: { id?: string; name?: string }
    people?: unknown[]
    personStrategies?: unknown[]
    socialSecurityStrategies?: unknown[]
    socialSecurityEarnings?: unknown[]
    futureWorkStrategies?: unknown[]
    futureWorkPeriods?: unknown[]
    spendingStrategies?: unknown[]
    spendingLineItems?: unknown[]
    nonInvestmentAccounts?: unknown[]
    investmentAccounts?: unknown[]
    investmentAccountHoldings?: unknown[]
    taxPolicies?: unknown[]
    irmaaTables?: unknown[]
    rmdTable?: unknown[]
  }
  return [
    `scenarioId=${data.scenario?.id ?? 'unknown'}`,
    `people=${getCount(data.people)}`,
    `personStrategies=${getCount(data.personStrategies)}`,
    `socialSecurityStrategies=${getCount(data.socialSecurityStrategies)}`,
    `socialSecurityEarnings=${getCount(data.socialSecurityEarnings)}`,
    `futureWorkStrategies=${getCount(data.futureWorkStrategies)}`,
    `futureWorkPeriods=${getCount(data.futureWorkPeriods)}`,
    `spendingStrategies=${getCount(data.spendingStrategies)}`,
    `spendingLineItems=${getCount(data.spendingLineItems)}`,
    `cashAccounts=${getCount(data.nonInvestmentAccounts)}`,
    `investmentAccounts=${getCount(data.investmentAccounts)}`,
    `holdings=${getCount(data.investmentAccountHoldings)}`,
    `taxPolicies=${getCount(data.taxPolicies)}`,
    `irmaaTables=${getCount(data.irmaaTables)}`,
    `rmdTable=${getCount(data.rmdTable)}`,
  ].join(', ')
}

self.onmessage = (event: MessageEvent<RunScenarioRequest>) => {
  const { input, requestId } = event.data
  const startedAt = Date.now()
  console.info('[Simulation] Run requested.', {
    requestId,
    startDate: input?.startDate,
    summary: summarizeSnapshot(input?.snapshot),
  })

  const parsed = simulationRequestSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    console.warn('[Simulation] Invalid request.', {
      requestId,
      issue,
      summary: summarizeSnapshot(input?.snapshot),
    })
    const response: RunScenarioResponse = {
      type: 'runScenarioResult',
      requestId,
      run: {
        id: createUuid(),
        scenarioId: input?.snapshot?.scenario?.id ?? createUuid(),
        startedAt,
        finishedAt: Date.now(),
        status: 'error',
        errorMessage: formatZodError(issue),
        result: emptyResult,
        snapshot: input?.snapshot,
      },
    }
    self.postMessage(response)
    return
  }

  console.info('[Simulation] Snapshot accepted.', {
    requestId,
    summary: summarizeSnapshot(parsed.data.snapshot),
  })
  const simulationInput = buildSimulationInputFromRequest(parsed.data)
  if (!simulationInput) {
    const reason =
      parsed.data.snapshot.people.length === 0
        ? 'Snapshot has no people.'
        : 'Scenario snapshot is missing required data.'
    console.warn('[Simulation] Unable to build simulation input.', {
      requestId,
      summary: summarizeSnapshot(parsed.data.snapshot),
    })
    const response: RunScenarioResponse = {
      type: 'runScenarioResult',
      requestId,
      run: {
        id: createUuid(),
        scenarioId: parsed.data.snapshot.scenario.id,
        startedAt,
        finishedAt: Date.now(),
        status: 'error',
        errorMessage: `${reason} ${summarizeSnapshot(parsed.data.snapshot)}`,
        result: emptyResult,
        snapshot: parsed.data.snapshot,
      },
    }
    self.postMessage(response)
    return
  }

  console.info('[Simulation] Input built.', {
    requestId,
    startDate: simulationInput.settings.startDate,
    endDate: simulationInput.settings.endDate,
    months: simulationInput.settings.months,
    stepMonths: simulationInput.settings.stepMonths,
  })
  const result = runSimulation(simulationInput)
  console.info('[Simulation] Run complete.', {
    requestId,
    status: 'success',
    timelinePoints: result.timeline.length,
    monthlyTimelinePoints: result.monthlyTimeline?.length ?? 0,
  })
  const response: RunScenarioResponse = {
    type: 'runScenarioResult',
    requestId,
    run: {
      id: createUuid(),
      scenarioId: parsed.data.snapshot.scenario.id,
      startedAt,
      finishedAt: Date.now(),
      status: 'success',
      result,
      snapshot: parsed.data.snapshot,
    },
  }
  self.postMessage(response)
}
