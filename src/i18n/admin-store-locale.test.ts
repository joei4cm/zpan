import { describe, expect, it } from 'vitest'
import en from './locales/en.json'
import zh from './locales/zh.json'

const enLocale = en as Record<string, string>
const zhLocale = zh as Record<string, string>

const ADMIN_STORE_KEYS = [
  'admin.nav.cloudStore',
  'admin.store.title',
  'admin.store.description',
  'admin.store.productsTitle',
  'admin.store.giftCardsTitle',
  'admin.store.addProduct',
  'admin.store.noProducts',
  'admin.store.fieldName',
  'admin.store.fieldStorage',
  'admin.store.fieldPrice',
  'admin.store.issueGiftCards',
  'admin.store.issuedCodesTitle',
  'storage.redeemStorageSuccess',
]

describe('admin.store locale keys — presence', () => {
  for (const key of ADMIN_STORE_KEYS) {
    it(`en.json contains key "${key}"`, () => {
      expect(Object.hasOwn(enLocale, key)).toBe(true)
    })

    it(`zh.json contains key "${key}"`, () => {
      expect(Object.hasOwn(zhLocale, key)).toBe(true)
    })
  }
})

describe('admin.store locale keys — English values contract', () => {
  it('admin.nav.cloudStore is "Storage Plans"', () => {
    expect(enLocale['admin.nav.cloudStore']).toBe('Storage Plans')
  })

  it('admin.store.title is "Storage Plans"', () => {
    expect(enLocale['admin.store.title']).toBe('Storage Plans')
  })
})

describe('admin.store locale keys — i18n runtime translation', () => {
  it('translates admin.store.title to English', async () => {
    const { default: i18n } = await import('./index')
    await i18n.changeLanguage('en')
    expect(i18n.t('admin.store.title')).toBe('Storage Plans')
  })

  it('translates admin.store.title to Chinese', async () => {
    const { default: i18n } = await import('./index')
    await i18n.changeLanguage('zh')
    expect(i18n.t('admin.store.title')).toBe('存储套餐')
  })
})
