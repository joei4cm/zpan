import { createHash } from 'node:crypto'
import { generateToken } from '../../shared/ids'
import {
  emptyAlbumList,
  emptyArtists,
  emptyIndexes,
  emptyMusicFolders,
  emptyPlaylists,
  emptySearch3,
  subsonicErrorBody,
  subsonicSuccessBody,
  verifySubsonicPassword,
} from '../domain/subsonic'
import { getAppVersion } from '../version'
import type { MusicAppCredentialRepo, OrgRepo } from './ports'
import { badRequest, conflict, notFound } from './ports'

export type MusicDeps = {
  musicCredentials: MusicAppCredentialRepo
  org: OrgRepo
}

function md5Hex(value: string): string {
  return createHash('md5').update(value).digest('hex')
}

function toCredentialView(
  record: {
    id: string
    userId: string
    orgId: string
    username: string
    label: string
    status: string
    createdAt: Date
    updatedAt: Date
    lastUsedAt: Date | null
  },
  token?: string,
) {
  return {
    id: record.id,
    userId: record.userId,
    orgId: record.orgId,
    username: record.username,
    label: record.label,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
    ...(token ? { token } : {}),
  }
}

export async function createMusicAppCredential(
  deps: MusicDeps,
  params: { userId: string; orgId: string; label?: string; username?: string },
) {
  const canWrite = await deps.org.canWriteToOrg(params.userId, params.orgId)
  if (!canWrite) throw badRequest('Not allowed for this space', 'FORBIDDEN_SPACE')
  const username = params.username?.trim() || `music_${generateToken(10)}`
  const existing = await deps.musicCredentials.findByUsername(username)
  if (existing) throw conflict('Music username already exists', 'MUSIC_USERNAME_TAKEN')
  const token = generateToken(32)
  const created = await deps.musicCredentials.create({
    userId: params.userId,
    orgId: params.orgId,
    username,
    token,
    label: params.label?.trim() || 'Music app',
  })
  return toCredentialView(created, token)
}

export async function listMusicAppCredentials(deps: MusicDeps, userId: string) {
  const items = await deps.musicCredentials.listByUser(userId)
  return { items: items.map((item) => toCredentialView(item)), total: items.length }
}

export async function revokeMusicAppCredential(deps: MusicDeps, params: { userId: string; id: string }) {
  const revoked = await deps.musicCredentials.revoke(params.id, params.userId)
  if (!revoked) throw notFound('Music credential not found')
}

export async function authenticateMusicRequest(
  deps: MusicDeps,
  params: { username?: string | null; password?: string | null; token?: string | null; salt?: string | null },
) {
  const version = getAppVersion()
  if (!params.username)
    return { ok: false as const, body: subsonicErrorBody(version, 10, 'Required parameter is missing.') }
  const credential = await deps.musicCredentials.findByUsername(params.username)
  if (!credential) return { ok: false as const, body: subsonicErrorBody(version, 40, 'Wrong username or password.') }
  const valid = verifySubsonicPassword({
    storedToken: credential.token,
    password: params.password,
    token: params.token,
    salt: params.salt,
    md5Hex,
  })
  if (!valid) return { ok: false as const, body: subsonicErrorBody(version, 40, 'Wrong username or password.') }
  await deps.musicCredentials.touchLastUsed(credential.id)
  return { ok: true as const, credential }
}

export function handleSubsonicMethod(
  method: string,
  credential: { orgId: string; username: string; userId: string },
): { status: number; body: Record<string, unknown> } {
  const version = getAppVersion()
  switch (method) {
    case 'ping':
      return { status: 200, body: subsonicSuccessBody(version) }
    case 'getLicense':
      return {
        status: 200,
        body: subsonicSuccessBody(version, {
          license: { valid: true, email: credential.username, licenseExpires: '2099-12-31T23:59:59.000Z' },
        }),
      }
    case 'getOpenSubsonicExtensions':
      return {
        status: 200,
        body: subsonicSuccessBody(version, {
          openSubsonicExtensions: [{ name: 'formPost', versions: [1] }],
        }),
      }
    case 'getUser':
      return {
        status: 200,
        body: subsonicSuccessBody(version, {
          user: {
            username: credential.username,
            email: '',
            scrobblingEnabled: false,
            adminRole: false,
            settingsRole: false,
            downloadRole: true,
            uploadRole: false,
            playlistRole: false,
            coverArtRole: true,
            commentRole: false,
            podcastRole: false,
            streamRole: true,
            jukeboxRole: false,
            shareRole: false,
            videoConversionRole: false,
            folder: [credential.orgId],
          },
        }),
      }
    case 'getMusicFolders':
      return {
        status: 200,
        body: subsonicSuccessBody(version, emptyMusicFolders(credential.orgId, 'ZPan Music')),
      }
    case 'getArtists':
      return { status: 200, body: subsonicSuccessBody(version, emptyArtists()) }
    case 'getIndexes':
      return { status: 200, body: subsonicSuccessBody(version, emptyIndexes()) }
    case 'getAlbumList':
    case 'getAlbumList2':
      return { status: 200, body: subsonicSuccessBody(version, emptyAlbumList()) }
    case 'search2':
    case 'search3':
      return { status: 200, body: subsonicSuccessBody(version, emptySearch3()) }
    case 'getPlaylists':
      return { status: 200, body: subsonicSuccessBody(version, emptyPlaylists()) }
    case 'getGenres':
      return { status: 200, body: subsonicSuccessBody(version, { genres: { genre: [] } }) }
    case 'star':
    case 'unstar':
    case 'setRating':
    case 'scrobble':
    case 'createPlaylist':
    case 'updatePlaylist':
    case 'deletePlaylist':
    case 'createBookmark':
    case 'deleteBookmark':
    case 'savePlayQueue':
      return {
        status: 200,
        body: subsonicErrorBody(version, 70, 'Unsupported operation for this ZPan music adapter.'),
      }
    default:
      return {
        status: 200,
        body: subsonicErrorBody(version, 70, `The requested resource was not found: ${method}`),
      }
  }
}
