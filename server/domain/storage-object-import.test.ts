import { describe, expect, it } from 'vitest'
import { folderChain, objectKeyToMatterPath } from './storage-object-import'

describe('storage object import path mapping', () => {
  it('maps nested keys to parent/name', () => {
    expect(objectKeyToMatterPath('a/b/c.txt')).toEqual({ parent: 'a/b', name: 'c.txt' })
    expect(objectKeyToMatterPath('solo.bin')).toEqual({ parent: '', name: 'solo.bin' })
  })

  it('strips an optional prefix', () => {
    expect(objectKeyToMatterPath('uploads/a/b.txt', { stripPrefix: 'uploads' })).toEqual({
      parent: 'a',
      name: 'b.txt',
    })
    expect(objectKeyToMatterPath('other/a.txt', { stripPrefix: 'uploads' })).toBeNull()
  })

  it('builds folder chain for nested parents', () => {
    expect(folderChain('a/b/c')).toEqual(['a', 'a/b', 'a/b/c'])
    expect(folderChain('')).toEqual([])
  })
})
