import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listLocalStoreGiftCards, listLocalStoreProducts } from '@/lib/api'
import { AdminStorePage } from './store'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en' },
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/api', () => ({
  listLocalStoreProducts: vi.fn(),
  listLocalStoreGiftCards: vi.fn(),
  createLocalStoreProduct: vi.fn(),
  updateLocalStoreProduct: vi.fn(),
  deleteLocalStoreProduct: vi.fn(),
  createLocalStoreGiftCards: vi.fn(),
  disableLocalStoreGiftCard: vi.fn(),
}))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminStorePage />
    </QueryClientProvider>,
  )
}

describe('AdminStorePage', () => {
  beforeEach(() => {
    vi.mocked(listLocalStoreProducts).mockResolvedValue({
      items: [
        {
          id: 'pkg-1',
          name: 'Pro',
          description: '',
          kind: 'plan',
          storageBytes: 10 * 1024 ** 3,
          amountCents: 999,
          currency: 'usd',
          interval: 'month',
          active: true,
          sortOrder: 0,
          createdAt: '2026-10-06T00:00:00.000Z',
          updatedAt: '2026-10-06T00:00:00.000Z',
        },
      ],
      total: 1,
    })
    vi.mocked(listLocalStoreGiftCards).mockResolvedValue({ items: [], total: 0 })
  })

  afterEach(() => cleanup())

  it('renders local packages', async () => {
    renderPage()
    expect(await screen.findByText('Pro')).toBeTruthy()
    expect(screen.getByText('admin.store.addProduct')).toBeTruthy()
    expect(screen.getByText('admin.store.issueGiftCards')).toBeTruthy()
  })
})
