import { db } from './db.js'
import { fail } from './http-error.js'
import { gamesRepository } from './repositories/games.js'

function gameById(gameId) {
  const game = gamesRepository.findById(gameId)
  if (!game) fail(404, 'Игра не найдена')
  return game
}

function assertTenant(req, gameId) {
  if (req.tenant?.game && req.tenant.game.id !== gameId) {
    fail(403, 'Игра недоступна на этом поддомене')
  }
}

export function isOrganizer(gameId, user) {
  if (!user) return false
  return Boolean(db.prepare('SELECT 1 FROM organizers WHERE game_id = ? AND user_id = ?').get(gameId, user.id))
}

export function hasAcceptedOrganizer(gameId) {
  return Boolean(db.prepare('SELECT 1 FROM organizers WHERE game_id = ? AND user_id IS NOT NULL LIMIT 1').get(gameId))
}

export function gameTokenFromRequest(req) {
  return req.get?.('x-game-token') ?? null
}

export function inviteTokenFromRequest(req) {
  return req.get?.('x-invite-token') ?? null
}

export function requireOrganizer(gameId, user) {
  if (!isOrganizer(gameId, user)) {
    fail(403, 'Только организатор может выполнять это действие')
  }
}

export function requireGameAccess(req, gameId) {
  const game = gameById(gameId)
  assertTenant(req, gameId)
  if (isOrganizer(gameId, req.user)) return game
  if (gameTokenFromRequest(req) === game.token) return game
  fail(403, 'Нет доступа к игре')
}

export function requireParticipantAccess(req, gameId, participantId) {
  const game = gameById(gameId)
  assertTenant(req, gameId)
  if (isOrganizer(gameId, req.user)) return game

  const inviteToken = inviteTokenFromRequest(req)
  const participant = db
    .prepare('SELECT id FROM participants WHERE id = ? AND game_id = ? AND invite_token = ?')
    .get(participantId, gameId, inviteToken)
  if (!participant) fail(403, 'Нет доступа к анкете участника')
  return game
}

export function requireQuestionAccess(req, gameId) {
  gameById(gameId)
  assertTenant(req, gameId)
  if (isOrganizer(gameId, req.user)) return
  const inviteToken = inviteTokenFromRequest(req)
  if (
    !inviteToken ||
    !db.prepare('SELECT 1 FROM participants WHERE game_id = ? AND invite_token = ?').get(gameId, inviteToken)
  ) {
    fail(403, 'Нет доступа к вопросам игры')
  }
}

export function participantByInvite(req, gameId) {
  gameById(gameId)
  assertTenant(req, gameId)
  const token = inviteTokenFromRequest(req)
  const participant = db.prepare('SELECT * FROM participants WHERE game_id = ? AND invite_token = ?').get(gameId, token)
  if (!participant) fail(403, 'Нет доступа к игре')
  return participant
}
