const thirdPartyNotices = [
  {
    name: '@hookform/resolvers',
    license: 'MIT',
    url: 'https://github.com/react-hook-form/resolvers/blob/master/LICENSE',
  },
  {
    name: '@tanstack/react-table',
    license: 'MIT',
    url: 'https://github.com/TanStack/table/blob/main/LICENSE',
  },
  { name: '@vitejs/plugin-react', license: 'MIT', url: 'https://github.com/vitejs/vite/blob/main/LICENSE' },
  { name: '@eslint/js', license: 'MIT', url: 'https://github.com/eslint/eslint/blob/main/LICENSE' },
  { name: '@types/node', license: 'MIT', url: 'https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE' },
  { name: '@types/react', license: 'MIT', url: 'https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE' },
  { name: '@types/react-dom', license: 'MIT', url: 'https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/LICENSE' },
  { name: 'React', license: 'MIT', url: 'https://github.com/facebook/react/blob/main/LICENSE' },
  {
    name: 'React DOM',
    license: 'MIT',
    url: 'https://github.com/facebook/react/blob/main/LICENSE',
  },
  { name: 'React Router', license: 'MIT', url: 'https://github.com/remix-run/react-router/blob/main/LICENSE.md' },
  { name: 'React Hook Form', license: 'MIT', url: 'https://github.com/react-hook-form/react-hook-form/blob/master/LICENSE' },
  { name: 'Zod', license: 'MIT', url: 'https://github.com/colinhacks/zod/blob/master/LICENSE' },
  { name: 'Zustand', license: 'MIT', url: 'https://github.com/pmndrs/zustand/blob/main/LICENSE' },
  { name: 'Dexie', license: 'Apache-2.0', url: 'https://github.com/dexie/Dexie.js/blob/master/LICENSE' },
  { name: 'Recharts', license: 'MIT', url: 'https://github.com/recharts/recharts/blob/master/LICENSE' },
  { name: 'uuid', license: 'MIT', url: 'https://github.com/uuidjs/uuid/blob/main/LICENSE.md' },
  { name: 'Vite', license: 'MIT', url: 'https://github.com/vitejs/vite/blob/main/LICENSE' },
  { name: 'Vitest', license: 'MIT', url: 'https://github.com/vitest-dev/vitest/blob/main/LICENSE' },
  { name: 'Playwright', license: 'Apache-2.0', url: 'https://github.com/microsoft/playwright/blob/main/LICENSE' },
  { name: 'ESLint', license: 'MIT', url: 'https://github.com/eslint/eslint/blob/main/LICENSE' },
  { name: 'eslint-config-prettier', license: 'MIT', url: 'https://github.com/prettier/eslint-config-prettier/blob/main/LICENSE' },
  { name: 'eslint-plugin-react-hooks', license: 'MIT', url: 'https://github.com/facebook/react/blob/main/LICENSE' },
  { name: 'eslint-plugin-react-refresh', license: 'MIT', url: 'https://github.com/vitejs/vite-plugin-react/blob/main/LICENSE' },
  { name: 'globals', license: 'MIT', url: 'https://github.com/sindresorhus/globals/blob/main/license' },
  { name: 'Prettier', license: 'MIT', url: 'https://github.com/prettier/prettier/blob/main/LICENSE' },
  { name: 'TypeScript', license: 'Apache-2.0', url: 'https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt' },
  { name: 'typescript-eslint', license: 'MIT', url: 'https://github.com/typescript-eslint/typescript-eslint/blob/main/LICENSE' },
]

const LicensePage = () => (
  <section className="stack">
    <header className="page-header">
      <div>
        <h1>Licensing</h1>
        <p className="muted">RePlan is released under the PolyForm Noncommercial License 1.0.0.</p>
      </div>
    </header>
    <div className="card stack">
      <p>
        RePlan is licensed under the PolyForm Noncommercial License 1.0.0. Commercial use is not
        permitted under this license.
      </p>
      <p>
        Read the full license in the{' '}
        <a
          className="link"
          href="https://github.com/kirkhaines/replan/blob/main/LICENSE"
          target="_blank"
          rel="noreferrer"
        >
          LICENSE file on GitHub
        </a>
        .
      </p>
    </div>
    <div className="card stack">
      <h2>Copyright and trademarks</h2>
      <p>© 2025 Kirk Haines. All rights reserved.</p>
      <p>RePlan is a trademark of Kirk Haines.</p>
      <h2>Disclaimer</h2>
      <p>
        This software is provided "as is", without warranty of any kind, express or implied,
        including but not limited to the warranties of merchantability, fitness for a particular
        purpose, and noninfringement. In no event shall the authors or copyright holders be liable
        for any claim, damages, or other liability, whether in an action of contract, tort, or
        otherwise, arising from, out of, or in connection with the software or the use or other
        dealings in the software.
      </p>
    </div>
    <div className="card stack">
      <h2>Third-party notices</h2>
      <p className="muted">
        RePlan depends on the following open source packages. Please refer to each project for full
        license text and notices.
      </p>
      <ul>
        {thirdPartyNotices.map((notice) => (
          <li key={notice.name}>
            {notice.name} - {notice.license} (
            <a className="link" href={notice.url} target="_blank" rel="noreferrer">
              license
            </a>
            )
          </li>
        ))}
      </ul>
    </div>
  </section>
)

export default LicensePage
