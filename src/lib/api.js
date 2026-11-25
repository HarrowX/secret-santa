const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request(path, options = {}) {
  let response

  try {
    response = await fetch(`${baseUrl}${path}`, {
      credentials: 'include',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers ?? {}),
      },
    })
  } catch {
    throw new ApiError(0, 'Не удалось связаться с сервером')
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, payload?.error?.message || payload?.message || 'Ошибка запроса')
  }
  return payload
}

export const api = {
  auth: {
    session: () => request('/auth/session'),
    createSession: () => request('/auth/session', { method: 'POST' }),
    recover: (code) => request('/auth/recovery', { method: 'POST', body: JSON.stringify({ code }) }),
    setEmail: (email) => request('/auth/email', { method: 'PATCH', body: JSON.stringify({ email }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
  },
  games: {
    list: () => request('/games'),
    get: (id) => request(`/games/${encodeURIComponent(id)}`),
    create: (body) => request('/games', { method: 'POST', body: JSON.stringify(body) }),
    addParticipant: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/participants`, { method: 'POST', body: JSON.stringify(body) }),
    addParticipants: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/participants/bulk`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    updateParticipant: (id, participantId, body) =>
      request(`/games/${encodeURIComponent(id)}/participants/${participantId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
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
    pairs: (id) => request(`/games/${encodeURIComponent(id)}/pairs`),
    events: (id) => request(`/games/${encodeURIComponent(id)}/events`),
    notifications: (id) => request(`/games/${encodeURIComponent(id)}/notifications`),
    questions: (id) => request(`/games/${encodeURIComponent(id)}/questions`),
    addQuestion: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/questions`, { method: 'POST', body: JSON.stringify(body) }),
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
    organizers: (id) => request(`/games/${encodeURIComponent(id)}/organizers`),
    addOrganizer: (id, body) =>
      request(`/games/${encodeURIComponent(id)}/organizers`, { method: 'POST', body: JSON.stringify(body) }),
    removeOrganizer: (id, organizerId) =>
      request(`/games/${encodeURIComponent(id)}/organizers/${organizerId}`, { method: 'DELETE' }),
  },
  me: {
    games: () => request('/me/games'),
    exchanges: () => request('/me/exchanges'),
  },
  invites: {
    get: (token) => request(`/invites/${encodeURIComponent(token)}`),
    accept: (token, body) =>
      request(`/invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  tenants: {
    list: () => request('/tenants'),
    get: (slug) => request(`/tenants/${encodeURIComponent(slug)}`),
    create: (body) => request('/tenants', { method: 'POST', body: JSON.stringify(body) }),
  },
}

export async function ensureSession() {
  const { user } = await api.auth.session()
  if (user) return user
  return (await api.auth.createSession()).user
}
