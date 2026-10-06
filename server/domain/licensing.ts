import { PRO_GATE_KEYS } from '@shared/feature-registry'
import type { BindingState, LicenseFeature } from '@shared/types'

const BUSINESS_ONLY_FEATURES = new Set<LicenseFeature>(['quota_store', 'site_announcements'])

// Self-hosted fork switch: when ZPAN_UNLOCK_FEATURES=true, local Pro/Business
// gates open without a ZPan Cloud certificate. Store, traffic billing, and
// licensing refresh stay on this instance — they do not call Cloud.
let featureUnlockEnabled = false

export function registerFeatureUnlock(raw: string | undefined | null): void {
  const normalized = (raw ?? '').trim().toLowerCase()
  featureUnlockEnabled = normalized === 'true' || normalized === '1' || normalized === 'yes'
}

export function isFeatureUnlockEnabled(): boolean {
  return featureUnlockEnabled
}

export function unlockedBindingState(): BindingState {
  return {
    bound: true,
    active: true,
    edition: 'business',
    features: effectiveFeatures('business'),
    account_email: 'internal',
  }
}

export function effectiveFeatures(edition: BindingState['edition']): LicenseFeature[] {
  if (edition === 'pro') return PRO_GATE_KEYS.filter((feature) => !BUSINESS_ONLY_FEATURES.has(feature))
  if (edition === 'business') return [...PRO_GATE_KEYS]
  return []
}

export function hasFeature(feature: LicenseFeature, state: BindingState | null): boolean {
  if (featureUnlockEnabled) return Boolean(feature)
  return Boolean(feature && state?.bound && state.active && effectiveFeatures(state.edition).includes(feature))
}
