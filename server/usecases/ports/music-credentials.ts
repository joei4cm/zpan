export type MusicAppCredentialStatus = 'active' | 'revoked'

export interface MusicAppCredentialRecord {
  id: string
  userId: string
  orgId: string
  username: string
  token: string
  label: string
  status: MusicAppCredentialStatus
  createdAt: Date
  updatedAt: Date
  lastUsedAt: Date | null
}

export interface MusicAppCredentialRepo {
  create(input: {
    userId: string
    orgId: string
    username: string
    token: string
    label: string
  }): Promise<MusicAppCredentialRecord>
  listByUser(userId: string): Promise<MusicAppCredentialRecord[]>
  findByUsername(username: string): Promise<MusicAppCredentialRecord | null>
  revoke(id: string, userId: string): Promise<boolean>
  touchLastUsed(id: string): Promise<void>
}
