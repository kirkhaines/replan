import { HashRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import ScenarioListPage from '../features/scenarios/ScenarioListPage'
import ScenarioDetailPage from '../features/scenarios/ScenarioDetailPage'
import RunResultsPage from '../features/runs/RunResultsPage'
import PeopleListPage from '../features/people/PeopleListPage'
import PeopleDetailPage from '../features/people/PeopleDetailPage'
import PersonStrategyDetailPage from '../features/people/PersonStrategyDetailPage'
import SsaBenefitDetailsPage from '../features/people/SsaBenefitDetailsPage'
import FutureWorkPeriodDetailPage from '../features/people/FutureWorkPeriodDetailPage'
import SpendingStrategyDetailPage from '../features/spending/SpendingStrategyDetailPage'
import SpendingLineItemDetailPage from '../features/spending/SpendingLineItemDetailPage'
import DefaultsPage from '../features/settings/DefaultsPage'
import { seedDefaults } from '../core/defaults/seedDefaults'
import AccountsPage from '../features/accounts/AccountsPage'
import NonInvestmentAccountDetailPage from '../features/accounts/NonInvestmentAccountDetailPage'
import InvestmentAccountDetailPage from '../features/accounts/InvestmentAccountDetailPage'
import HoldingDetailPage from '../features/accounts/HoldingDetailPage'
import AboutPage from '../features/about/AboutPage'
import LicensePage from '../features/about/LicensePage'
import HelpPage from '../features/about/HelpPage'
import { useAppStore } from '../state/appStore'
import { demoScenarios } from '../core/defaults/demo'
import type { LocalScenarioSeed } from '../core/defaults/localSeedTypes'

const NotFound = () => (
  <section className="stack">
    <h1>Page not found</h1>
    <Link className="link" to="/scenarios">
      Back to scenarios
    </Link>
  </section>
)

const AppShell = () => {
  const navigate = useNavigate()
  const storage = useAppStore((state) => state.storage)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    void seedDefaults(storage)
  }, [storage])

  const handleClearData = async () => {
    const confirmed = window.confirm('Clear all local data? This cannot be undone.')
    if (!confirmed) {
      return
    }
    await storage.clearAll()
    await seedDefaults(storage)
    setMenuOpen(false)
    navigate('/scenarios')
  }

  const importScenarioSeed = async (seed: LocalScenarioSeed) => {
    await Promise.all(seed.people.map((record) => storage.personRepo.upsert(record)))
    await Promise.all(
      seed.socialSecurityEarnings.map((record) =>
        storage.socialSecurityEarningsRepo.upsert(record),
      ),
    )
    await Promise.all(
      seed.socialSecurityStrategies.map((record) =>
        storage.socialSecurityStrategyRepo.upsert(record),
      ),
    )
    await Promise.all(
      seed.futureWorkStrategies.map((record) =>
        storage.futureWorkStrategyRepo.upsert(record),
      ),
    )
    await Promise.all(
      seed.futureWorkPeriods.map((record) => storage.futureWorkPeriodRepo.upsert(record)),
    )
    await Promise.all(
      seed.spendingStrategies.map((record) => storage.spendingStrategyRepo.upsert(record)),
    )
    await Promise.all(
      seed.spendingLineItems.map((record) => storage.spendingLineItemRepo.upsert(record)),
    )
    await Promise.all(
      seed.nonInvestmentAccounts.map((record) => storage.nonInvestmentAccountRepo.upsert(record)),
    )
    await Promise.all(
      seed.investmentAccounts.map((record) => storage.investmentAccountRepo.upsert(record)),
    )
    await Promise.all(
      seed.investmentAccountHoldings.map((record) =>
        storage.investmentAccountHoldingRepo.upsert(record),
      ),
    )
    await Promise.all(
      seed.personStrategies.map((record) => storage.personStrategyRepo.upsert(record)),
    )
    await storage.scenarioRepo.upsert(seed.scenario)
  }

  const handleAddDemoScenario = async (seed: LocalScenarioSeed) => {
    await importScenarioSeed(seed)
    setMenuOpen(false)
    window.dispatchEvent(new Event('demo-scenario-added'))
    navigate('/scenarios')
  }

  return (
    <div className="app">
      <header className="nav">
        <div className="brand">
          <Link to="/scenarios">RePlan</Link>
        </div>
        <nav className="nav-links">
          <Link to="/scenarios">Scenarios</Link>
          <Link to="/people">People</Link>
          <Link to="/accounts">Accounts</Link>
          <div className="menu">
            <button
              className="link-button"
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <svg
                className="menu-icon"
                viewBox="0 0 24 24"
                width="20"
                height="20"
                aria-hidden="true"
              >
                <path
                  d="M12 3.5l1.2 2.4a6.9 6.9 0 0 1 2 0.8l2.5-0.6 1.3 2.2-1.9 1.6a7 7 0 0 1 0 2.3l1.9 1.6-1.3 2.2-2.5-0.6a6.9 6.9 0 0 1-2 0.8L12 20.5l-1.2-2.4a6.9 6.9 0 0 1-2-0.8l-2.5 0.6-1.3-2.2 1.9-1.6a7 7 0 0 1 0-2.3L4.9 8.5l1.3-2.2 2.5 0.6a6.9 6.9 0 0 1 2-0.8L12 3.5z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="sr-only">Menu</span>
            </button>
            {menuOpen ? (
              <div className="menu-panel" role="menu">
                <Link to="/help" role="menuitem" onClick={() => setMenuOpen(false)}>
                  Help
                </Link>
                <Link to="/about" role="menuitem" onClick={() => setMenuOpen(false)}>
                  About
                </Link>
                <Link to="/license" role="menuitem" onClick={() => setMenuOpen(false)}>
                  Licensing
                </Link>
                <Link to="/defaults" role="menuitem" onClick={() => setMenuOpen(false)}>
                  Defaults/Reference
                </Link>
                <div className="menu-section" role="presentation">
                  <span className="menu-section-title">Demo scenarios</span>
                  <div className="menu-sublist">
                    {demoScenarios.map((demo) => (
                      <button
                        key={demo.id}
                        className="menu-item"
                        type="button"
                        role="menuitem"
                        onClick={() => void handleAddDemoScenario(demo.seed)}
                      >
                        {demo.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="menu-item danger"
                  type="button"
                  role="menuitem"
                  onClick={handleClearData}
                >
                  Clear data
                </button>
              </div>
            ) : null}
          </div>
        </nav>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/scenarios" replace />} />
          <Route path="/scenarios" element={<ScenarioListPage />} />
          <Route path="/scenarios/:id" element={<ScenarioDetailPage />} />
          <Route path="/runs/:id" element={<RunResultsPage />} />
          <Route path="/people" element={<PeopleListPage />} />
          <Route path="/people/:id" element={<PeopleDetailPage />} />
          <Route path="/person-strategies/:id" element={<PersonStrategyDetailPage />} />
          <Route path="/person-strategies/:id/ssa-benefit" element={<SsaBenefitDetailsPage />} />
          <Route path="/future-work-periods/:id" element={<FutureWorkPeriodDetailPage />} />
          <Route path="/spending-strategies/:id" element={<SpendingStrategyDetailPage />} />
          <Route path="/spending-line-items/:id" element={<SpendingLineItemDetailPage />} />
          <Route path="/defaults" element={<DefaultsPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/accounts/cash/:id" element={<NonInvestmentAccountDetailPage />} />
          <Route path="/accounts/investment/:id" element={<InvestmentAccountDetailPage />} />
          <Route path="/accounts/holding/:id" element={<HoldingDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/license" element={<LicensePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  )
}

const App = () => (
  <HashRouter>
    <AppShell />
  </HashRouter>
)

export default App
