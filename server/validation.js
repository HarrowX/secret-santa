import { z } from 'zod'
import { HttpError } from './http-error.js'

const text = z.string().trim().min(1)
const optionalLongText = z.string().trim().max(2000).nullable().optional()
const identifier = z.coerce.number().int().positive()
const questionTypes = ['text', 'number', 'boolean', 'single', 'multi']

export const schemas = {
  createGame: z
    .object({
      title: text.max(120),
      budget: z.string().trim().max(80).optional().default(''),
      exchangeDate: z.string().trim().max(40).optional().default(''),
      rules: z.string().trim().max(2000).optional().default(''),
      themeId: text.max(40).optional().default('winter'),
    })
    .strict(),
  participant: z.object({ name: text.max(80) }).strict(),
  participantBulk: z.object({ names: text.max(1000) }).strict(),
  randomizer: z.object({ names: text.max(5000) }).strict(),
  participantUpdate: z
    .object({
      name: text.max(80).optional(),
      email: z.string().trim().toLowerCase().email().nullable().optional(),
      wishlist: optionalLongText,
      address: optionalLongText,
      notes: optionalLongText,
      preferred: optionalLongText,
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, 'Нет полей для обновления'),
  inviteAccept: z
    .object({
      email: z.string().trim().toLowerCase().email().nullable().optional(),
      wishlist: optionalLongText,
      address: optionalLongText,
      notes: optionalLongText,
      preferred: optionalLongText,
    })
    .strict(),
  answersSave: z
    .object({
      answers: z
        .array(z.object({ questionId: identifier, value: z.string().trim().max(2000) }).strict())
        .max(10),
    })
    .strict(),
  exclusion: z.object({ fromId: identifier, toId: identifier }).strict(),
  pair: z.object({ fromId: identifier, toId: identifier }).strict(),
  reveal: z.object({ fromId: identifier }).strict(),
  questionCreate: z
    .object({
      title: text.max(120),
      hint: z.string().trim().max(200).optional().default(''),
      type: z.enum(questionTypes).optional().default('text'),
      required: z.boolean().optional().default(false),
      position: z.coerce.number().int().min(0).optional().default(0),
    })
    .strict(),
  questionUpdate: z
    .object({
      title: text.max(120).optional(),
      hint: z.string().trim().max(200).optional(),
      type: z.enum(questionTypes).optional(),
      required: z.boolean().optional(),
      position: z.coerce.number().int().min(0).optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, 'Нет полей для обновления'),
  message: z
    .object({
      body: text.max(2000),
      fromId: identifier.optional().nullable(),
      toId: identifier.optional().nullable(),
    })
    .strict(),
  pastPairsImport: z.object({ pastGameId: identifier }).strict(),
  reminder: z
    .object({
      body: text.max(1000),
      recipientIds: z.array(identifier).min(1).max(100),
    })
    .strict(),
  organizer: z.object({ token: text.max(80) }).strict(),
  credentials: z
    .object({
      email: z.string().trim().toLowerCase().email().max(160),
      password: z.string().min(6).max(200),
    })
    .strict(),
  recovery: z.object({ code: text.max(40) }).strict(),
  email: z.object({ email: z.string().trim().toLowerCase().email().max(160) }).strict(),
  tenant: z
    .object({
      slug: z.string().regex(/^[a-z0-9-]{3,32}$/, 'Неверный поддомен'),
      gameId: identifier,
      domain: z.string().trim().max(200).optional().nullable(),
    })
    .strict(),
}

export function validateBody(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {})
    if (!result.success) {
      const issue = result.error.issues[0]
      next(new HttpError(400, issue?.message || 'Неверные данные'))
      return
    }
    req.body = result.data
    next()
  }
}
