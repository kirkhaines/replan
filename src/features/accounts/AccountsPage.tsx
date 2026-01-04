import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAppStore } from '../../state/appStore'
import type {
  InvestmentAccount,
  InvestmentAccountHolding,
  NonInvestmentAccount,
} from '../../core/models'
import { createUuid } from '../../core/utils/uuid'
import PageHeader from '../../components/PageHeader'

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { style: 'currency', currency: 'USD' })

const createNonInvestmentAccount = (): NonInvestmentAccount => {
  const now = Date.now()
  return {
    id: createUuid(),
    name: 'Cash',
    balance: 10000,
    interestRate: 0.01,
    createdAt: now,
    updatedAt: now,
  }
}

const createInvestmentAccount = (): InvestmentAccount => {
  const now = Date.now()
  return {
    id: createUuid(),
    name: 'Brokerage',
    createdAt: now,
    updatedAt: now,
  }
}

const createHolding = (investmentAccountId: string): InvestmentAccountHolding => {
  const now = Date.now()
  return {
    id: createUuid(),
    name: 'S&P 500',
    taxType: 'taxable',
    balance: 50000,
    holdingType: 'sp500',
    return: 0.05,
    risk: 0.15,
    investmentAccountId,
    createdAt: now,
    updatedAt: now,
  }
}

const AccountsPage = () => {
  const storage = useAppStore((state) => state.storage)
  const location = useLocation()
  const [cashAccounts, setCashAccounts] = useState<NonInvestmentAccount[]>([])
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccount[]>([])
  const [investmentBalances, setInvestmentBalances] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)

  const loadAccounts = useCallback(async () => {
    setIsLoading(true)
    const [cash, investments, holdingList] = await Promise.all([
      storage.nonInvestmentAccountRepo.list(),
      storage.investmentAccountRepo.list(),
      storage.investmentAccountHoldingRepo.list(),
    ])
    setCashAccounts(cash)
    setInvestmentAccounts(investments)
    const balanceMap = holdingList.reduce<Record<string, number>>((acc, holding) => {
      acc[holding.investmentAccountId] =
        (acc[holding.investmentAccountId] ?? 0) + holding.balance
      return acc
    }, {})
    setInvestmentBalances(balanceMap)
    setIsLoading(false)
  }, [storage])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAccounts()
  }, [loadAccounts])

  const handleRemoveCash = async (accountId: string) => {
    const confirmed = window.confirm('Remove this cash account?')
    if (!confirmed) {
      return
    }
    await storage.nonInvestmentAccountRepo.remove(accountId)
    await loadAccounts()
  }

  const handleRemoveInvestment = async (accountId: string) => {
    const confirmed = window.confirm('Remove this investment account?')
    if (!confirmed) {
      return
    }
    const holdings = await storage.investmentAccountHoldingRepo.listForAccount(accountId)
    await Promise.all(holdings.map((holding) => storage.investmentAccountHoldingRepo.remove(holding.id)))
    await storage.investmentAccountRepo.remove(accountId)
    await loadAccounts()
  }

  const handleCreateCash = async () => {
    const account = createNonInvestmentAccount()
    await storage.nonInvestmentAccountRepo.upsert(account)
    await loadAccounts()
  }

  const handleCreateInvestment = async () => {
    const account = createInvestmentAccount()
    await storage.investmentAccountRepo.upsert(account)
    const holding = createHolding(account.id)
    await storage.investmentAccountHoldingRepo.upsert(holding)
    await loadAccounts()
  }

  return (
    <section className="stack">
      <PageHeader
        title="Accounts"
        subtitle="Track cash and investment accounts."
        actions={
          <div className="button-row">
            <button className="button" onClick={handleCreateCash}>
              Add cash account
            </button>
            <button className="button secondary" onClick={handleCreateInvestment}>
              Add investment account
            </button>
          </div>
        }
      />

      <div className="card stack">
        <h2>Cash accounts</h2>
        {isLoading ? (
          <p className="muted">Loading accounts...</p>
        ) : cashAccounts.length === 0 ? (
          <p className="muted">No cash accounts yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Balance</th>
                <th>Interest rate</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {cashAccounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <Link
                      className="link"
                      to={`/accounts/cash/${account.id}`}
                      state={{ from: location.pathname }}
                    >
                      {account.name}
                    </Link>
                  </td>
                  <td>{formatCurrency(account.balance)}</td>
                  <td>{account.interestRate}</td>
                  <td>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => void handleRemoveCash(account.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card stack">
        <h2>Investment accounts</h2>
        {isLoading ? (
          <p className="muted">Loading accounts...</p>
        ) : investmentAccounts.length === 0 ? (
          <p className="muted">No investment accounts yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Balance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {investmentAccounts.map((account) => (
                <tr key={account.id}>
                  <td>
                    <Link
                      className="link"
                      to={`/accounts/investment/${account.id}`}
                      state={{ from: location.pathname }}
                    >
                      {account.name}
                    </Link>
                  </td>
                  <td>{formatCurrency(investmentBalances[account.id] ?? 0)}</td>
                  <td>
                    <button
                      className="link-button"
                      type="button"
                      onClick={() => void handleRemoveInvestment(account.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

export default AccountsPage
