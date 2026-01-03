const AboutPage = () => (
  <section className="stack">
    <header className="page-header">
      <div>
        <h1>About RePlan</h1>
        <p className="muted">Local-first retirement planning with no server required.</p>
      </div>
    </header>
    <div className="card stack">
      <p>
        RePlan is a retirement planning app that keeps all of your data in the browser. Scenarios,
        people, accounts, and strategies are stored locally in IndexedDB, and simulations run in a
        Web Worker so the UI stays responsive.
      </p>
      <p>
        The architecture is modular by design. Core domain models and the simulation engine are
        isolated from UI code, and storage and simulation clients are injected through small
        interfaces so a future sync or remote backend can be added without rewriting features.
      </p>
      <p>
        The current focus is a deterministic v0 simulation loop with clear tables and charts so the
        data model and UX can evolve quickly before adding more advanced modeling.
      </p>
    </div>
  </section>
)

export default AboutPage
