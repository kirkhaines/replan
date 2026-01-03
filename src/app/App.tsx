import { HashRouter, Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import ScenarioListPage from '../features/scenarios/ScenarioListPage'
import ScenarioDetailPage from '../features/scenarios/ScenarioDetailPage'
import RunResultsPage from '../features/runs/RunResultsPage'
import PeopleListPage from '../features/people/PeopleListPage'
import PeopleDetailPage from '../features/people/PeopleDetailPage'
import AccountsPage from '../features/accounts/AccountsPage'
import NonInvestmentAccountDetailPage from '../features/accounts/NonInvestmentAccountDetailPage'
import InvestmentAccountDetailPage from '../features/accounts/InvestmentAccountDetailPage'
import HoldingDetailPage from '../features/accounts/HoldingDetailPage'
import AboutPage from '../features/about/AboutPage'
import LicensePage from '../features/about/LicensePage'
import { useAppStore } from '../state/appStore'

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

  const handleClearData = async () => {
    const confirmed = window.confirm('Clear all local data? This cannot be undone.')
    if (!confirmed) {
      return
    }
    await storage.clearAll()
    setMenuOpen(false)
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
              Menu
            </button>
            {menuOpen ? (
              <div className="menu-panel" role="menu">
                <Link to="/about" role="menuitem" onClick={() => setMenuOpen(false)}>
                  About
                </Link>
                <Link to="/license" role="menuitem" onClick={() => setMenuOpen(false)}>
                  Licensing
                </Link>
                <button className="menu-item" type="button" role="menuitem" onClick={handleClearData}>
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
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/accounts/cash/:id" element={<NonInvestmentAccountDetailPage />} />
          <Route path="/accounts/investment/:id" element={<InvestmentAccountDetailPage />} />
          <Route path="/accounts/holding/:id" element={<HoldingDetailPage />} />
          <Route path="/about" element={<AboutPage />} />
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
