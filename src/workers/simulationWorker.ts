/// <reference lib="webworker" />
import { runSimulation } from '../core/sim/engine'
import {
  buildSimulationInputFromRequest,
  simulationRequestSchema,
} from '../core/sim/input'
import type {
  RunScenarioBatchRequest,
  RunScenarioBatchResponse,
  RunScenarioRequest,
  RunScenarioResponse,
} from '../core/simClient/types'
import type { SimulationRun } from '../core/models'
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
    contributionLimits?: unknown[]
    taxPolicies?: unknown[]
    socialSecurityProvisionalIncomeBrackets?: unknown[]
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
    `contributionLimits=${getCount(data.contributionLimits)}`,
    `taxPolicies=${getCount(data.taxPolicies)}`,
    `ssProvisionalBrackets=${getCount(data.socialSecurityProvisionalIncomeBrackets)}`,
    `irmaaTables=${getCount(data.irmaaTables)}`,
    `rmdTable=${getCount(data.rmdTable)}`,
  ].join(', ')
}

const runScenarioOnce = (
  input: RunScenarioRequest['input'],
  requestId: string,
  logEnabled = true,
  summaryOnly = false,
): SimulationRun => {
  const startedAt = Date.now()
  if (logEnabled) {
    console.info('[Simulation] Run requested.', {
      requestId,
      startDate: input?.startDate,
      summary: summarizeSnapshot(input?.snapshot),
    })
  }

  const parsed = simulationRequestSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    if (logEnabled) {
      console.warn('[Simulation] Invalid request.', {
        requestId,
        issue,
        summary: summarizeSnapshot(input?.snapshot),
      })
    }
    const finishedAt = Date.now()
    return {
      id: createUuid(),
      scenarioId: input?.snapshot?.scenario?.id ?? createUuid(),
      startedAt,
      finishedAt,
      status: 'error',
      errorMessage: formatZodError(issue),
      result: emptyResult,
      snapshot: input?.snapshot,
      title: new Date(finishedAt).toLocaleString(),
    }
  }

  if (logEnabled) {
    console.info('[Simulation] Snapshot accepted.', {
      requestId,
      summary: summarizeSnapshot(parsed.data.snapshot),
    })
  }
  const simulationInput = buildSimulationInputFromRequest(parsed.data)
  if (!simulationInput) {
    const reason =
      parsed.data.snapshot.people.length === 0
        ? 'Snapshot has no people.'
        : 'Scenario snapshot is missing required data.'
    if (logEnabled) {
      console.warn('[Simulation] Unable to build simulation input.', {
        requestId,
        summary: summarizeSnapshot(parsed.data.snapshot),
      })
    }
    const finishedAt = Date.now()
    return {
      id: createUuid(),
      scenarioId: parsed.data.snapshot.scenario.id,
      startedAt,
      finishedAt,
      status: 'error',
      errorMessage: `${reason} ${summarizeSnapshot(parsed.data.snapshot)}`,
      result: emptyResult,
      snapshot: parsed.data.snapshot,
      title: new Date(finishedAt).toLocaleString(),
    }
  }

  if (logEnabled) {
    console.info('[Simulation] Input built.', {
      requestId,
      startDate: simulationInput.settings.startDate,
      endDate: simulationInput.settings.endDate,
      months: simulationInput.settings.months,
      stepMonths: simulationInput.settings.stepMonths,
    })
  }
  const result = runSimulation(simulationInput)
  const finishedAt = Date.now()
  if (logEnabled) {
    console.info('[Simulation] Run complete.', {
      requestId,
      status: 'success',
      timelinePoints: result.timeline.length,
      monthlyTimelinePoints: result.monthlyTimeline?.length ?? 0,
      durationMs: finishedAt - startedAt,
    })
  }
  const run: SimulationRun = {
    id: createUuid(),
    scenarioId: parsed.data.snapshot.scenario.id,
    startedAt,
    finishedAt,
    status: 'success',
    result,
    snapshot: parsed.data.snapshot,
    title: new Date(finishedAt).toLocaleString(),
  }
  if (!summaryOnly) {
    return run
  }
  return {
    ...run,
    result: {
      summary: run.result.summary,
      timeline: [],
    },
  }
}

self.onmessage = (event: MessageEvent<RunScenarioRequest | RunScenarioBatchRequest>) => {
  const { requestId } = event.data
  if (event.data.type === 'runScenarioBatch') {
    const inputs = event.data.inputs ?? []
    const batchStart = Date.now()
    console.info('[Simulation] Batch run requested.', {
      requestId,
      count: inputs.length,
    })
    const runs = inputs.map((input, index) =>
      runScenarioOnce(input, `${requestId}:${index + 1}`, false, true),
    )
    const batchFinished = Date.now()
    console.info('[Simulation] Batch run complete.', {
      requestId,
      count: runs.length,
      durationMs: batchFinished - batchStart,
    })
    const response: RunScenarioBatchResponse = {
      type: 'runScenarioBatchResult',
      requestId,
      runs,
    }
    self.postMessage(response)
    return
  }
  const run = runScenarioOnce(event.data.input, requestId)
  const response: RunScenarioResponse = {
    type: 'runScenarioResult',
    requestId,
    run,
  }
  self.postMessage(response)
}
