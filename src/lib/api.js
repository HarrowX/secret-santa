const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
const CSRF_COOKIE = 'santa_csrf'
const RECOVERY_CODES_KEY = 'santa-recovery-codes'

function csrfToken() {
  const cookie = document.cookie.split('; ').find((item) => item.startsWith(`${CSRF_COOKIE}=`))
  return cookie ? decodeURIComponent(cookie.slice(CSRF_COOKIE.length + 1)) : ''
}

function isUnsafeMethod(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
}

function accessHeaders(inviteToken, gameToken) {
  return {
    ...(inviteToken ? { 'x-invite-token': inviteToken } : {}),
    ...(gameToken ? { 'x-game-token': gameToken } : {}),
  }
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request(path, options = {}) {
  let response
  const method = options.method ?? 'GET'

  try {
    response = await fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      ...options,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(isUnsafeMethod(method) ? { 'x-csrf-token': csrfToken() } : {}),
        ...(options.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(0, 'Не удалось связаться с сервером')
  }

  const raw = await response.text().catch(() => '')
  let payload = null
  try {
    if (raw) payload = JSON.parse(raw)
  } catch {
    payload = null
  }

  if (!response.ok) {
    const text = raw.trim().startsWith('<') ? '' : raw.trim().slice(0, 300)
    const message = payload?.error?.message || payload?.message || text
    throw new ApiError(response.status, message || `Ошибка запроса (${response.status})`)
  }
  if (raw && payload === null) throw new ApiError(response.status, 'Сервер вернул неожиданный ответ')
  return payload
}

export const api = {
  auth: {
    session: () => request('/auth/session'),
    createSession: () => request('/auth/session', { method: 'POST' }),
    register: (body) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login: (body) => request('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    recover: (code) => request('/auth/recovery', { method: 'POST', body: JSON.stringify({ code }) }),
    setEmail: (email) => request('/auth/email', { method: 'PATCH', body: JSON.stringify({ email }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
  },
  games: {
    list: () => request('/games'),
    get: (id, gameToken) => request(`/games/${encodeURIComponent(id)}`, { headers: accessHeaders(null, gameToken) }),
    create: (body) => request('/games', { method: 'POST', body: JSON.stringify(body) }),
    update: (id, body, gameToken) =>
      request(`/games/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
        headers: accessHeaders(null, gameToken),
      }),
    addParticipant: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/participants`, { method: 'POST', body: JSON.stringify(body) }),
    addParticipants: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/participants/bulk`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    join: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/join`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: accessHeaders(null, String(id)),
      }),
    updateParticipant: (id, participantId, body) =>
      request(`/games/${encodeURIComponent(id)}/participants/${participantId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    removeParticipant: (id, participantId) =>
      request(`/games/${encodeURIComponent(id)}/participants/${participantId}`, {
        method: 'DELETE',
      }),
    invite: (id) => request(`/games/${encodeURIComponent(id)}/invite`),
    addExclusion: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/exclusions`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    removeExclusion: (id, fromId, toId) =>
      request(`/games/${encodeURIComponent(id)}/exclusions/${fromId}/${toId}`, { method: 'DELETE' }),
    draw: (id) => request(`/games/${encodeURIComponent(id)}/draw`, { method: 'POST' }),
    drawNew: (id) => request(`/games/${encodeURIComponent(id)}/draw/new`, { method: 'POST' }),
    resetPairs: (id) => request(`/games/${encodeURIComponent(id)}/pairs/reset`, { method: 'POST' }),
    setPair: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/pairs`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    reveal: (id, fromId) =>
      request(`/games/${encodeURIComponent(id)}/reveal`, {
        method: 'POST',
        body: JSON.stringify({ fromId }),
      }),
    pairs: (id, inviteToken, gameToken) =>
      request(`/games/${encodeURIComponent(id)}/pairs`, { headers: accessHeaders(inviteToken, gameToken) }),
    myPair: (id, inviteToken, gameToken) =>
      request(`/games/${encodeURIComponent(id)}/my-pair`, { headers: accessHeaders(inviteToken, gameToken) }),
    events: (id) => request(`/games/${encodeURIComponent(id)}/events`),
    notifications: (id, inviteToken, gameToken) =>
      request(`/games/${encodeURIComponent(id)}/notifications`, { headers: accessHeaders(inviteToken, gameToken) }),
    recipientAnswers: (id, inviteToken, gameToken) =>
      request(`/games/${encodeURIComponent(id)}/recipient-answers`, {
        headers: accessHeaders(inviteToken, gameToken),
      }),
    questions: (id, inviteToken, gameToken) =>
      request(`/games/${encodeURIComponent(id)}/questions`, {
        headers: accessHeaders(inviteToken, gameToken),
      }),
    addQuestion: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/questions`, { method: 'POST', body: JSON.stringify(body) }),
    answers: (id) => request(`/games/${encodeURIComponent(id)}/answers`),
    participantAnswers: (id, participantId, inviteToken, gameToken) =>
      request(`/games/${encodeURIComponent(id)}/participants/${participantId}/answers`, {
        headers: accessHeaders(inviteToken, gameToken),
      }),
    saveAnswers: (id, participantId, body, inviteToken, gameToken) =>
      request(`/games/${encodeURIComponent(id)}/participants/${participantId}/answers`, {
        method: 'PUT',
        body: JSON.stringify(body),
        headers: accessHeaders(inviteToken, gameToken),
      }),
    updateQuestion: (id, questionId, body) =>
      request(`/games/${encodeURIComponent(id)}/questions/${questionId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    deleteQuestion: (id, questionId) =>
      request(`/games/${encodeURIComponent(id)}/questions/${questionId}`, { method: 'DELETE' }),
    messages: (id) => request(`/games/${encodeURIComponent(id)}/messages`),
    addMessage: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/messages`, { method: 'POST', body: JSON.stringify(body) }),
    chat: (id, toId, inviteToken, gameToken) => {
      const query = toId ? `?toId=${encodeURIComponent(toId)}` : ''
      return request(`/games/${encodeURIComponent(id)}/chat${query}`, {
        headers: accessHeaders(inviteToken, gameToken),
      })
    },
    sendChat: (id, body, inviteToken, gameToken) =>
      request(`/games/${encodeURIComponent(id)}/chat`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: accessHeaders(inviteToken, gameToken),
      }),
    reminders: (id) => request(`/games/${encodeURIComponent(id)}/reminders`),
    importPastPairs: (id, pastGameId) =>
      request(`/games/${encodeURIComponent(id)}/past-pairs/import`, {
        method: 'POST',
        body: JSON.stringify({ pastGameId }),
      }),
    addReminder: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/reminders`, { method: 'POST', body: JSON.stringify(body) }),
    markGift: (id, participantId, kind) =>
      request(`/games/${encodeURIComponent(id)}/participants/${participantId}/gift-${kind}`, {
        method: 'POST',
      }),
    organizers: (id) => request(`/games/${encodeURIComponent(id)}/organizers`),
    addOrganizer: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/organizers`, { method: 'POST', body: JSON.stringify(body) }),
    inviteOrganizer: (id) => request(`/games/${encodeURIComponent(id)}/organizers/invite`, { method: 'POST' }),
    removeOrganizer: (id, organizerId) =>
      request(`/games/${encodeURIComponent(id)}/organizers/${organizerId}`, { method: 'DELETE' }),
  },
  organizerInvites: {
    accept: (token) =>
      request(`/organizer-invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
      }),
  },
  me: {
    games: () => request('/me/games'),
    pastGames: () => request('/me/past-games'),
    exchanges: () => request('/me/exchanges'),
  },
  randomizer: {
    draw: (names) => request('/randomizer', { method: 'POST', body: JSON.stringify({ names }) }),
  },
  support: {
    send: (body) => request('/support', { method: 'POST', body: JSON.stringify(body) }),
  },
  invites: {
    get: (token) => request(`/invites/${encodeURIComponent(token)}`),
    accept: (token, body) =>
      request(`/invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  themes: {
    list: () => request('/themes'),
  },
  tenants: {
    current: () => request('/tenants/current'),
    list: () => request('/tenants'),
    get: (slug) => request(`/tenants/${encodeURIComponent(slug)}`),
    create: (body, gameToken) =>
      request('/tenants', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: accessHeaders(null, gameToken),
      }),
  },
  metrics: () => request('/metrics'),
}

export function saveRecoveryCodes(codes) {
  if (!Array.isArray(codes) || !codes.length) return
  try {
    localStorage.setItem(RECOVERY_CODES_KEY, JSON.stringify(codes))
  } catch {
    return
  }
}

export function readRecoveryCodes() {
  try {
    const codes = JSON.parse(localStorage.getItem(RECOVERY_CODES_KEY) || '[]')
    return Array.isArray(codes) ? codes : []
  } catch {
    return []
  }
}

export function clearRecoveryCodes() {
  try {
    localStorage.removeItem(RECOVERY_CODES_KEY)
  } catch {
    return
  }
}

export async function ensureSession() {
  const session = await api.auth.session()
  if (session.user) return { user: session.user, recoveryCodes: readRecoveryCodes() }
  const created = await api.auth.createSession()
  saveRecoveryCodes(created.recoveryCodes)
  return { user: created.user, recoveryCodes: created.recoveryCodes }
}
