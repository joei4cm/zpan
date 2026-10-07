export type UploadSelectorExpression = {
  key: string
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist'
  values?: string[]
}

export type UploadSelector = {
  matchLabels?: Record<string, string>
  matchExpressions?: UploadSelectorExpression[]
}

export type UploadSelectionMode = 'ordered' | 'balanced'

export type UploadPolicyRecord = {
  id: string
  name: string
  enabled: boolean
  priority: number
  selector: UploadSelector
  storageIds: string[]
  selectionMode: UploadSelectionMode
  createdAt: Date
  updatedAt: Date
}

export type UploadContextLabels = Record<string, string>

export const DEFAULT_UPLOAD_POLICY_ID = 'default'

export const UPLOAD_SELECTOR_LABEL_KEYS = [
  'space.id',
  'space.type',
  'file.category',
  'file.mime',
  'file.extension',
  'upload.source',
] as const

export function isDefaultUploadPolicy(id: string): boolean {
  return id === DEFAULT_UPLOAD_POLICY_ID
}

export function selectorIsEmpty(selector: UploadSelector): boolean {
  const labels = Object.keys(selector.matchLabels ?? {})
  const expressions = selector.matchExpressions ?? []
  return labels.length === 0 && expressions.length === 0
}

export function matchUploadSelector(selector: UploadSelector, labels: UploadContextLabels): boolean {
  for (const [key, value] of Object.entries(selector.matchLabels ?? {})) {
    if (labels[key] !== value) return false
  }
  for (const expression of selector.matchExpressions ?? []) {
    const present = Object.hasOwn(labels, expression.key)
    const labelValue = labels[expression.key]
    const values = expression.values ?? []
    switch (expression.operator) {
      case 'Exists':
        if (!present) return false
        break
      case 'DoesNotExist':
        if (present) return false
        break
      case 'In':
        if (!present || !values.includes(labelValue)) return false
        break
      case 'NotIn':
        if (present && values.includes(labelValue)) return false
        break
      default:
        return false
    }
  }
  return true
}

export function resolveMatchingUploadPolicy(
  policies: UploadPolicyRecord[],
  labels: UploadContextLabels,
): UploadPolicyRecord | null {
  const enabled = policies.filter((policy) => policy.enabled)
  const matched = enabled
    .filter((policy) => matchUploadSelector(policy.selector, labels))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
  return matched[0] ?? null
}

export function pickStorageIdFromPolicy(
  policy: UploadPolicyRecord,
  eligibleIds: string[],
  options: { mode?: UploadSelectionMode; utilizationById?: Record<string, number> } = {},
): string | null {
  const orderedEligible = policy.storageIds.filter((id) => eligibleIds.includes(id))
  if (orderedEligible.length === 0) return null
  const mode = options.mode ?? policy.selectionMode
  if (mode === 'balanced') {
    const utilization = options.utilizationById ?? {}
    return [...orderedEligible].sort((a, b) => {
      const ua = utilization[a] ?? Number.POSITIVE_INFINITY
      const ub = utilization[b] ?? Number.POSITIVE_INFINITY
      if (ua !== ub) return ua - ub
      return policy.storageIds.indexOf(a) - policy.storageIds.indexOf(b)
    })[0]
  }
  return orderedEligible[0]
}
