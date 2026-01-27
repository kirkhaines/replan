import type { Scenario } from '../../core/models'

export type ScenarioEditorValues = {
  scenario: Scenario
}

export type SpendingIntervalRow = {
  startMs: number | null
  endMs: number | null
  startLabel: string
  endLabel: string
  needTotal: number
  wantTotal: number
}
