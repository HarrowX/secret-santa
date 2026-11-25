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
    draw: (id) => request(`/games/${encodeURIComponent(id)}/draw`, { method: 'POST' }),
    pairs: (id) => request(`/games/${encodeURIComponent(id)}/pairs`),
    events: (id) => request(`/games/${encodeURIComponent(id)}/events`),
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
  tenants: {
    list: () => request('/tenants'),
    get: (slug) => request(`/tenants/${encodeURIComponent(slug)}`),
    create: (body) => request('/tenants', { method: 'POST', body: JSON.stringify(body) }),
  },
}
