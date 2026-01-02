import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import ScenarioListPage from '../features/scenarios/ScenarioListPage'
import ScenarioDetailPage from '../features/scenarios/ScenarioDetailPage'
import RunResultsPage from '../features/runs/RunResultsPage'

const NotFound = () => (
  <section className="stack">
    <h1>Page not found</h1>
    <Link className="link" to="/scenarios">
      Back to scenarios
    </Link>
  </section>
)

const App = () => (
  <BrowserRouter>
    <div className="app">
      <header className="nav">
        <div className="brand">
          <Link to="/scenarios">RePlan</Link>
        </div>
        <nav>
          <Link to="/scenarios">Scenarios</Link>
        </nav>
      </header>
      <main className="container">
        <Routes>
          <Route path="/" element={<Navigate to="/scenarios" replace />} />
          <Route path="/scenarios" element={<ScenarioListPage />} />
          <Route path="/scenarios/:id" element={<ScenarioDetailPage />} />
          <Route path="/runs/:id" element={<RunResultsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  </BrowserRouter>
)

export default App
