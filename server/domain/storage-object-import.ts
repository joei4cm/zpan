/** Map an S3 object key into a ZPan matter parent path + file name. */
export function objectKeyToMatterPath(
  key: string,
  options: { stripPrefix?: string } = {},
): { parent: string; name: string } | null {
  let relative = key.replace(/^\/+/, '')
  const prefix = (options.stripPrefix ?? '').replace(/^\/+|\/+$/g, '')
  if (prefix) {
    if (!relative.startsWith(`${prefix}/`) && relative !== prefix) return null
    relative = relative === prefix ? '' : relative.slice(prefix.length + 1)
  }
  if (!relative || relative.endsWith('/')) return null
  const parts = relative.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const name = parts[parts.length - 1]
  const parent = parts.slice(0, -1).join('/')
  return { parent, name }
}

export function folderChain(parent: string): string[] {
  if (!parent) return []
  const parts = parent.split('/').filter(Boolean)
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'))
}
