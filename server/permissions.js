import { db } from './db.js'
import { fail } from './http-error.js'
import { gamesRepository } from './repositories/games.js'

function gameById(gameId) {
  const game = gamesRepository.findById(gameId)
  if (!game) fail(404, 'Игра не найдена')
  return game
}

function hasOrganizer(gameId) {
  return db.prepare('SELECT 1 FROM organizers WHERE game_id = ? AND user_id IS NOT NULL LIMIT 1').get(gameId)
}

function isOrganizer(gameId, user) {
  if (!user) return false
  return db.prepare('SELECT 1 FROM organizers WHERE game_id = ? AND user_id = ?').get(gameId, user.id)
}

function gameTokenFromRequest(req, game) {
  if (req.params?.id === game.token) return game.token
  return req.get?.('x-game-token') ?? req.query?.gameToken ?? req.body?.gameToken ?? null
}

function inviteTokenFromRequest(req) {
  return req.get?.('x-invite-token') ?? req.query?.inviteToken ?? req.body?.inviteToken ?? null
}

export function requireOrganizer(gameId, user) {
  if (hasOrganizer(gameId) && !isOrganizer(gameId, user)) {
    fail(403, 'Только организатор может выполнять это действие')
  }
}

export function canManageGame(req, gameId) {
  const game = gameById(gameId)
  if (isOrganizer(gameId, req.user)) return true
  if (hasOrganizer(gameId)) return false
  return gameTokenFromRequest(req, game) === game.token
}

export function requireGameAccess(req, gameId) {
  const game = gameById(gameId)
  if (req.tenant?.game && req.tenant.game.id !== gameId) {
    fail(403, 'Игра недоступна на этом поддомене')
  }
  if (isOrganizer(gameId, req.user)) return game
  if (gameTokenFromRequest(req, game) === game.token) return game
  if (hasOrganizer(gameId)) fail(403, 'Только организатор может выполнять это действие')
  fail(403, 'Нужна ссылка на игру')
}

export function requireParticipantAccess(req, gameId, participantId) {
  const game = gameById(gameId)
  if (req.tenant?.game && req.tenant.game.id !== gameId) {
    fail(403, 'Игра недоступна на этом поддомене')
  }
  if (canManageGame(req, gameId)) return game

  const inviteToken = inviteTokenFromRequest(req)
  const participant = db
    .prepare('SELECT id FROM participants WHERE id = ? AND game_id = ? AND invite_token = ?')
    .get(participantId, gameId, inviteToken)
  if (!participant) fail(403, 'Нет доступа к анкете участника')
  return game
}

export function requireQuestionAccess(req, gameId) {
  gameById(gameId)
  if (req.tenant?.game && req.tenant.game.id !== gameId) {
    fail(403, 'Игра недоступна на этом поддомене')
  }
  if (canManageGame(req, gameId)) return
  const inviteToken = inviteTokenFromRequest(req)
  if (
    !inviteToken ||
    !db.prepare('SELECT 1 FROM participants WHERE game_id = ? AND invite_token = ?').get(gameId, inviteToken)
  ) {
    fail(403, 'Нет доступа к вопросам игры')
  }
}

export function hasAcceptedOrganizer(gameId) {
  return Boolean(hasOrganizer(gameId))
}
