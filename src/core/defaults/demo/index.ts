import type { LocalScenarioSeed } from '../localSeedTypes'

export type DemoScenario = {
  id: string
  label: string
  seed: LocalScenarioSeed
}

const modules = import.meta.glob('./*.json', { eager: true }) as Record<
  string,
  { default: LocalScenarioSeed }
>

export const demoScenarios: DemoScenario[] = Object.entries(modules)
  .map(([path, module]) => {
    const file = path.split('/').pop() ?? ''
    const id = file.replace(/\\.json$/i, '')
    return {
      id,
      label: module.default.scenario.name,
      seed: module.default,
    }
  })
  .sort((a, b) => a.label.localeCompare(b.label))
