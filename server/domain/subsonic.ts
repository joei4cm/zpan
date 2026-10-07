export const SUBSONIC_API_VERSION = '1.16.1'

export type SubsonicErrorCode = 0 | 10 | 20 | 30 | 40 | 41 | 50 | 60 | 70

export function verifySubsonicPassword(params: {
  storedToken: string
  password?: string | null
  token?: string | null
  salt?: string | null
  md5Hex: (value: string) => string
}): boolean {
  const password = params.password?.trim()
  if (password) {
    if (password.startsWith('enc:')) {
      try {
        const hex = password.slice(4)
        const decoded = Buffer.from(hex, 'hex').toString('utf8')
        return decoded === params.storedToken
      } catch {
        return false
      }
    }
    return password === params.storedToken
  }
  if (params.token && params.salt) {
    return params.token.toLowerCase() === params.md5Hex(`${params.storedToken}${params.salt}`).toLowerCase()
  }
  return false
}

export function subsonicSuccessBody(serverVersion: string, payload: Record<string, unknown> = {}) {
  return {
    'subsonic-response': {
      status: 'ok',
      version: SUBSONIC_API_VERSION,
      type: 'ZPan',
      serverVersion,
      openSubsonic: true,
      ...payload,
    },
  }
}

export function subsonicErrorBody(serverVersion: string, code: SubsonicErrorCode, message: string) {
  return {
    'subsonic-response': {
      status: 'failed',
      version: SUBSONIC_API_VERSION,
      type: 'ZPan',
      serverVersion,
      openSubsonic: true,
      error: { code, message },
    },
  }
}

export function emptyMusicFolders(orgId: string, name: string) {
  return {
    musicFolders: {
      musicFolder: [{ id: orgId, name }],
    },
  }
}

export function emptyArtists() {
  return {
    artists: {
      index: [],
      ignoredArticles: 'The El La Los Las Le Les',
    },
  }
}

export function emptyAlbumList() {
  return { albumList2: { album: [] } }
}

export function emptySearch3() {
  return {
    searchResult3: {
      artist: [],
      album: [],
      song: [],
    },
  }
}

export function emptyPlaylists() {
  return { playlists: { playlist: [] } }
}

export function emptyIndexes() {
  return {
    indexes: {
      ignoredArticles: 'The El La Los Las Le Les',
      index: [],
    },
  }
}
