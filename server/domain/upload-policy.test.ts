import { describe, expect, it } from 'vitest'
import {
  matchUploadSelector,
  pickStorageIdFromPolicy,
  resolveMatchingUploadPolicy,
  type UploadPolicyRecord,
} from './upload-policy'

const basePolicy = (overrides: Partial<UploadPolicyRecord> = {}): UploadPolicyRecord => ({
  id: 'p1',
  name: 'policy',
  enabled: true,
  priority: 10,
  selector: {},
  storageIds: ['s1', 's2'],
  selectionMode: 'ordered',
  ...overrides,
})

describe('upload policy matching', () => {
  it('matches empty selector against any labels', () => {
    expect(matchUploadSelector({}, { 'space.id': 'org-1' })).toBe(true)
  })

  it('requires all matchLabels', () => {
    expect(
      matchUploadSelector(
        { matchLabels: { 'space.type': 'team', 'file.category': 'image' } },
        { 'space.type': 'team', 'file.category': 'image' },
      ),
    ).toBe(true)
    expect(
      matchUploadSelector(
        { matchLabels: { 'space.type': 'team', 'file.category': 'image' } },
        { 'space.type': 'team', 'file.category': 'video' },
      ),
    ).toBe(false)
  })

  it('supports In / NotIn / Exists / DoesNotExist expressions', () => {
    const labels = { 'file.extension': 'png', 'upload.source': 'web' }
    expect(
      matchUploadSelector(
        { matchExpressions: [{ key: 'file.extension', operator: 'In', values: ['png', 'jpg'] }] },
        labels,
      ),
    ).toBe(true)
    expect(
      matchUploadSelector(
        { matchExpressions: [{ key: 'file.extension', operator: 'NotIn', values: ['png'] }] },
        labels,
      ),
    ).toBe(false)
    expect(matchUploadSelector({ matchExpressions: [{ key: 'file.mime', operator: 'DoesNotExist' }] }, labels)).toBe(
      true,
    )
    expect(matchUploadSelector({ matchExpressions: [{ key: 'upload.source', operator: 'Exists' }] }, labels)).toBe(true)
  })

  it('picks highest priority matching policy', () => {
    const policies = [
      basePolicy({ id: 'default', priority: 0, selector: {} }),
      basePolicy({
        id: 'team-images',
        priority: 50,
        selector: { matchLabels: { 'space.type': 'team', 'file.category': 'image' } },
        storageIds: ['img'],
      }),
      basePolicy({
        id: 'team-any',
        priority: 40,
        selector: { matchLabels: { 'space.type': 'team' } },
        storageIds: ['team'],
      }),
    ]
    const matched = resolveMatchingUploadPolicy(policies, {
      'space.type': 'team',
      'file.category': 'image',
    })
    expect(matched?.id).toBe('team-images')
  })

  it('picks ordered then balanced storage ids', () => {
    const policy = basePolicy({ storageIds: ['a', 'b', 'c'], selectionMode: 'ordered' })
    expect(pickStorageIdFromPolicy(policy, ['b', 'c'])).toBe('b')
    expect(
      pickStorageIdFromPolicy(policy, ['a', 'b', 'c'], {
        mode: 'balanced',
        utilizationById: { a: 0.9, b: 0.1, c: 0.2 },
      }),
    ).toBe('b')
  })
})
