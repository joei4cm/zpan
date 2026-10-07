import { Hono } from 'hono'
import { subsonicErrorBody } from '../../domain/subsonic'
import type { Env } from '../../middleware/platform'
import { authenticateMusicRequest, handleSubsonicMethod } from '../../usecases/music'
import { getAppVersion } from '../../version'

function wantsJson(c: {
  req: { query: (k: string) => string | undefined; header: (k: string) => string | undefined }
}) {
  const f = c.req.query('f')?.toLowerCase()
  if (f === 'json' || f === 'jsonp') return true
  const accept = c.req.header('Accept') ?? ''
  return accept.includes('application/json')
}

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function renderSubsonic(
  c: {
    req: { query: (k: string) => string | undefined; header: (k: string) => string | undefined }
    json: (body: unknown, status?: number) => Response
    text: (body: string, status?: number, headers?: Record<string, string>) => Response
  },
  status: number,
  body: Record<string, unknown>,
) {
  if (wantsJson(c)) {
    const callback = c.req.query('callback')
    if (callback) {
      return c.text(`${callback}(${JSON.stringify(body)})`, status, {
        'Content-Type': 'application/javascript; charset=utf-8',
      })
    }
    return c.json(body, status)
  }
  const response = body['subsonic-response'] as Record<string, unknown>
  const attrs = Object.entries(response)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(' ')
  const error = response.error as { code?: number; message?: string } | undefined
  const errorXml = error ? `<error code="${error.code ?? 0}" message="${escapeXml(error.message ?? '')}"/>` : ''
  const xml = `<?xml version="1.0" encoding="UTF-8"?><subsonic-response ${attrs} xmlns="http://subsonic.org/restapi">${errorXml}</subsonic-response>`
  return c.text(xml, status, { 'Content-Type': 'application/xml; charset=utf-8' })
}

const app = new Hono<Env>()

app.all('/:method', async (c) => {
  const raw = c.req.param('method')
  if (!raw.endsWith('.view')) {
    return renderSubsonic(c, 200, subsonicErrorBody(getAppVersion(), 70, 'The requested resource was not found.'))
  }
  const method = raw.slice(0, -'.view'.length)
  const auth = await authenticateMusicRequest(c.get('deps'), {
    username: c.req.query('u'),
    password: c.req.query('p'),
    token: c.req.query('t'),
    salt: c.req.query('s'),
  })
  if (!auth.ok) return renderSubsonic(c, 200, auth.body)
  const result = handleSubsonicMethod(method, auth.credential)
  return renderSubsonic(c, result.status, result.body)
})

export const subsonicRest = app
