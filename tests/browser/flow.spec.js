import { test, expect } from '@playwright/test'

async function expectDateFieldTheme(page, colorScheme, backgroundColor, borderColor, calendarColor) {
  const dateField = page.getByLabel('Дата обмена')
  await expect(dateField).toHaveCSS('color-scheme', colorScheme)
  await expect(dateField).toHaveCSS('background-color', backgroundColor)
  await expect(dateField).toHaveCSS('border-color', borderColor)
  const backgroundImage = await dateField.evaluate((element) => getComputedStyle(element).backgroundImage)
  expect(backgroundImage).toContain('data:image/svg+xml')
  expect(backgroundImage).toContain(calendarColor)
}

test('organizer and anonymous participants complete the game in the browser', async ({ browser }) => {
  const organizerContext = await browser.newContext()
  await organizerContext.addInitScript(() => localStorage.setItem('santa-mode', 'day'))
  const organizer = await organizerContext.newPage()

  await organizer.goto('/new')
  const origin = await organizer.evaluate(() => window.location.origin)
  await organizerContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })
  await expect(organizer.getByLabel('Название')).toHaveAttribute('placeholder', 'Корпоратив в декабре')
  await expect(organizer.getByLabel('Бюджет')).toHaveAttribute('placeholder', '1500 ₽')
  await expect(organizer.getByLabel('Правила')).toHaveAttribute('placeholder', 'Без сладкого, до 25 декабря')
  await expect(organizer.getByLabel('Формат')).toHaveCSS('color-scheme', 'light')
  await expectDateFieldTheme(organizer, 'light', 'rgba(255, 255, 255, 0.65)', 'rgba(15, 23, 42, 0.16)', '%23334155')
  await expect(organizer.locator('.theme-decor--winter').first()).toBeVisible()
  await organizer.getByLabel('Название').fill('Браузерная игра')
  await organizer.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(organizer).toHaveURL(/\/game\//)
  await expect(organizer.getByRole('heading', { name: 'Браузерная игра' })).toBeVisible()
  const notifications = organizer.getByRole('region', { name: 'Уведомления об изменениях' })
  const refreshNotifications = notifications.getByRole('button', { name: 'Обновить уведомления' })
  await expect(refreshNotifications).toHaveText('Обновить уведомления')
  await expect(refreshNotifications).not.toHaveAttribute('aria-label')
  await expect(organizer.getByText('Текст напоминания', { exact: true })).toBeVisible()
  await expect(organizer.getByLabel('Текст напоминания')).toHaveAttribute(
    'placeholder',
    'Напоминаю: обмен подарками 25 декабря',
  )
  await expect(organizer.getByLabel('Адрес игры на поддомене')).toHaveAttribute('placeholder', 'korporativ-2026')
  await organizer.getByLabel('Адрес игры на поддомене').fill('browser-tenant-link')
  await organizer.getByRole('button', { name: 'Сохранить адрес' }).click()
  const tenantLink = organizer.getByRole('link', { name: 'Открыть адрес игры' })
  await expect(tenantLink).toBeVisible()
  await expect(tenantLink).toHaveText('Открыть адрес игры')
  await expect(tenantLink).not.toHaveAttribute('aria-label')
  await expect(tenantLink).toHaveAttribute('target', '_blank')
  await expect(tenantLink).toHaveAttribute('rel', 'noopener noreferrer')
  const tenantUrl = String(await tenantLink.getAttribute('href'))
  await expect(tenantLink.locator('xpath=..').locator('span')).toHaveText(tenantUrl)
  await expect(organizer.getByText('Получатели напоминания', { exact: true })).toBeVisible()
  await expect(
    organizer
      .locator('label')
      .filter({ has: organizer.getByLabel('Прошлая игра для импорта пар') })
      .locator('span')
      .getByText('Прошлая игра для импорта пар', { exact: true }),
  ).toBeVisible()
  await expect(
    organizer
      .locator('label')
      .filter({ has: organizer.getByLabel('Участник для отметки подарка') })
      .locator('span')
      .getByText('Участник для отметки подарка', { exact: true }),
  ).toBeVisible()

  await expect(organizer.getByText('Список имён через запятую', { exact: true })).toBeVisible()
  await expect(organizer.getByLabel('Список имён через запятую')).toHaveAttribute('placeholder', 'Аня, Борис, Вика')
  await organizer.getByLabel('Список имён через запятую').fill('Аня, Борис')
  await organizer.getByRole('button', { name: 'Добавить список' }).click()

  const aniaLink = organizer.getByRole('button', { name: 'Скопировать ссылку-приглашение для Аня' })
  const borisLink = organizer.getByRole('button', { name: 'Скопировать ссылку-приглашение для Борис' })
  await expect(aniaLink).toBeVisible()
  await expect(borisLink).toBeVisible()
  await expect(aniaLink).toHaveText('Скопировать ссылку-приглашение для Аня')
  await expect(borisLink).toHaveText('Скопировать ссылку-приглашение для Борис')
  await expect(aniaLink).not.toHaveAttribute('aria-label')
  await expect(borisLink).not.toHaveAttribute('aria-label')
  const aniaUrl = (await aniaLink.locator('xpath=..').locator('span').nth(1).textContent()).trim()
  const borisUrl = (await borisLink.locator('xpath=..').locator('span').nth(1).textContent()).trim()
  await aniaLink.click()
  expect(await organizer.evaluate(() => navigator.clipboard.readText())).toBe(aniaUrl)
  await borisLink.click()
  expect(await organizer.evaluate(() => navigator.clipboard.readText())).toBe(borisUrl)

  const aniaContext = await browser.newContext()
  const ania = await aniaContext.newPage()
  await ania.goto(aniaUrl)
  await expect(ania.getByLabel('Email по желанию')).toHaveAttribute('placeholder', 'name@example.com')
  await expect(ania.getByLabel('Желания')).toHaveAttribute('placeholder', 'Книга "Мастер и Маргарита"')
  await expect(ania.getByLabel('Адрес доставки')).toHaveAttribute('placeholder', 'Москва, ул. Лесная, 5')
  await expect(ania.getByLabel('С кем хотите играть')).toHaveAttribute('placeholder', 'Аня, Борис, Вика')
  await expect(ania.getByLabel('Заметки организатору')).toHaveAttribute('placeholder', 'Не звонить после 21:00')
  await expect(ania.getByLabel('Код участия из прошлой игры (необязательно)')).toHaveAttribute(
    'placeholder',
    'A1B2-C3D4-E5F6-7182',
  )
  await ania.getByLabel('Желания').fill('Книга для Ани')
  await ania.getByRole('button', { name: 'Подтвердить участие' }).click()
  await expect(ania.getByText('Пара ещё не раскрыта')).toBeVisible()
  await expect(ania.getByText('Вы дарите')).toHaveCount(0)

  const borisContext = await browser.newContext()
  const boris = await borisContext.newPage()
  await boris.goto(borisUrl)
  await boris.getByLabel('Желания').fill('Книга')
  await boris.getByRole('button', { name: 'Подтвердить участие' }).click()
  await expect(boris.getByText('Вы в игре')).toBeVisible()

  for (const [name, text] of [
    ['Кто не дарит', 'Кто не дарит'],
    ['Кому не дарит', 'Кому не дарит'],
    ['Кто дарит в ручной паре', 'Кто дарит в ручной паре'],
    ['Кому дарит в ручной паре', 'Кому дарит в ручной паре'],
  ]) {
    await expect(
      organizer
        .locator('label')
        .filter({ has: organizer.getByLabel(name) })
        .locator('span')
        .getByText(text, { exact: true }),
    ).toBeVisible()
  }

  await organizer.getByLabel('Кто дарит в ручной паре').selectOption({ label: 'Аня' })
  await organizer.getByLabel('Кому дарит в ручной паре').selectOption({ label: 'Борис' })
  await organizer.getByRole('button', { name: 'Зафиксировать' }).click()
  await expect(organizer.getByText('Аня → Борис')).toBeVisible()

  organizer.once('dialog', (dialog) => dialog.accept())
  await organizer.getByRole('button', { name: 'Показать пару' }).click()

  await ania.reload()
  await expect(ania.getByText('Вы дарите: Борис')).toBeVisible()
  await expect(ania.getByText('Желания: Книга')).toBeVisible()

  await boris.reload()
  await expect(boris.getByRole('tab', { name: 'От Санты' })).toBeVisible()

  await expect(
    ania
      .locator('label')
      .filter({ has: ania.getByLabel('Собеседник') })
      .getByText('Собеседник', { exact: true }),
  ).toBeVisible()
  await expect(
    ania
      .locator('label')
      .filter({ has: ania.getByLabel('Текст сообщения') })
      .locator('span')
      .getByText('Текст сообщения', { exact: true }),
  ).toBeVisible()
  await expect(
    ania
      .locator('label')
      .filter({ has: ania.getByLabel('Ссылка на изображение (необязательно)') })
      .locator('span')
      .getByText('Ссылка на изображение (необязательно)', { exact: true }),
  ).toBeVisible()
  await expect(ania.getByLabel('Текст сообщения')).toHaveAttribute('placeholder', 'Привет! Спасибо за подарок.')
  await expect(ania.getByLabel('Ссылка на изображение (необязательно)')).toHaveAttribute(
    'placeholder',
    'https://example.com/gift.jpg',
  )

  await ania.getByLabel('Текст сообщения').fill('Привет, Борис!')
  await ania.getByLabel('Ссылка на изображение (необязательно)').fill('https://example.com/gift.jpg')
  await ania.getByRole('button', { name: 'Отправить' }).click()
  await expect(ania.getByText('Привет, Борис!')).toBeVisible()
  const imageLink = ania.getByRole('link', { name: 'Открыть изображение (внешняя ссылка)' })
  await expect(imageLink).toHaveText('Открыть изображение (внешняя ссылка)')
  await expect(imageLink).not.toHaveAttribute('aria-label')
  await expect(imageLink).toHaveAttribute('href', 'https://example.com/gift.jpg')

  await boris.reload()
  await expect(boris.getByText('Привет, Борис!')).toBeVisible()
  await expect(boris.getByRole('link', { name: 'Открыть изображение (внешняя ссылка)' })).toHaveAttribute(
    'href',
    'https://example.com/gift.jpg',
  )

  await organizerContext.close()
  await aniaContext.close()
  await borisContext.close()
})

test('participants join by the common link and the organizer can remove a bad name', async ({ browser }) => {
  const organizerContext = await browser.newContext()
  const organizer = await organizerContext.newPage()

  await organizer.goto('/new')
  await organizer.getByLabel('Название').fill('Игра с общими приглашениями')
  await organizer.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(organizer).toHaveURL(/\/game\//)

  await organizer.getByLabel('Название вопроса').fill('Любите ли вы читать?')
  const questionTypeSelect = organizer.getByLabel('Тип вопроса')
  await expect(questionTypeSelect).toHaveCSS('appearance', 'none')
  await expect(questionTypeSelect).toHaveCSS('color-scheme', 'dark')
  await questionTypeSelect.selectOption('boolean')
  await organizer.getByLabel('Обязательно').check()
  await organizer.getByRole('button', { name: 'Добавить вопрос' }).click()
  await expect(organizer.getByText('Любите ли вы читать? · Да/Нет')).toBeVisible()

  const commonButton = organizer.getByRole('button', { name: 'Скопировать общую ссылку на игру' })
  await expect(commonButton).toBeVisible()
  await expect(commonButton).toHaveText('Скопировать общую ссылку на игру')
  await expect(commonButton).not.toHaveAttribute('aria-label')
  const commonUrl = String(await commonButton.locator('xpath=..').locator('span').textContent()).trim()
  const commonPath = commonUrl.startsWith('http') ? new URL(commonUrl).pathname : commonUrl

  const joinerContext = await browser.newContext()
  const joiner = await joinerContext.newPage()
  await joiner.goto(commonPath)
  await expect(joiner.getByText('Присоединиться к игре')).toBeVisible()
  await expect(joiner.getByText('Ваше имя', { exact: true })).toBeVisible()
  await expect(joiner.getByLabel('Ваше имя')).toHaveAttribute('placeholder', 'Аня')
  await joiner.getByLabel('Ваше имя').fill('Глупое имя')
  await joiner.getByRole('button', { name: 'Присоединиться' }).click()
  await expect(joiner).toHaveURL(/\/join\//)
  await expect(joiner.getByRole('heading', { name: 'Анкета' })).toBeVisible()
  await expect(joiner.getByText('Любите ли вы читать? (обязательно)', { exact: true })).toBeVisible()
  await joiner.getByLabel('Любите ли вы читать? (обязательно)').selectOption('да')
  await joiner.getByRole('button', { name: 'Сохранить ответы' }).click()
  await expect(joiner.getByRole('combobox', { name: 'Любите ли вы читать? (обязательно)' })).toHaveValue('да')

  await joiner.getByLabel('Желания').fill('Книга')
  await joiner.getByRole('button', { name: 'Подтвердить участие' }).click()
  await expect(joiner.getByText('Вы в игре')).toBeVisible()

  await organizer.reload()
  const badInvite = organizer.getByRole('button', { name: 'Скопировать ссылку-приглашение для Глупое имя' })
  await expect(badInvite).toBeVisible()
  await organizer.getByRole('button', { name: /Глупое имя участвует/ }).click()
  organizer.once('dialog', (dialog) => dialog.accept())
  const removeBadName = organizer.getByRole('button', { name: 'Удалить участника Глупое имя' })
  await expect(removeBadName).not.toHaveAttribute('aria-label')
  await expect(removeBadName).toHaveText('Удалить участника Глупое имя')
  await removeBadName.click()
  await expect(badInvite).toHaveCount(0)

  await organizerContext.close()
  await joinerContext.close()
})

test('assistant invite is accepted in another browser context and survives page reload', async ({ browser }) => {
  const organizerContext = await browser.newContext()
  const organizer = await organizerContext.newPage()

  await organizer.goto('/new')
  await organizer.getByLabel('Название').fill('Игра с помощником')
  await organizer.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(organizer).toHaveURL(/\/game\//)
  await expect(organizer.getByRole('heading', { name: 'Игра с помощником' })).toBeVisible()

  await organizer.getByLabel('Список имён через запятую').fill('Вера, Глеб')
  await organizer.getByRole('button', { name: 'Добавить список' }).click()
  await expect(organizer.getByRole('button', { name: 'Скопировать ссылку-приглашение для Вера' })).toBeVisible()

  const inviteResponsePromise = organizer.waitForResponse(
    (response) => response.url().includes('/organizers/invite') && response.request().method() === 'POST',
  )
  await organizer.getByRole('button', { name: 'Пригласить помощника' }).click()
  const inviteResponse = await inviteResponsePromise
  expect(inviteResponse.status()).toBe(201)
  const invitePath = new URL((await inviteResponse.json()).url).pathname

  const team = organizer.getByTestId('organizer-team')
  await expect(team.getByText('создатель', { exact: true })).toHaveCount(1)
  await expect(team.getByText('ожидает принятия', { exact: true })).toHaveCount(1)
  await expect(team.getByText('организатор', { exact: true })).toHaveCount(0)
  await expect(team.getByText('Приглашение ещё не принято')).toHaveCount(0)
  await expect(team).not.toContainText('@')
  await expect(team).not.toContainText('/organizer/')

  const assistantContext = await browser.newContext()
  const assistant = await assistantContext.newPage()
  await assistant.goto(invitePath)
  await expect(assistant).toHaveURL(/\/game\//)
  await expect(assistant.getByRole('heading', { name: 'Игра с помощником' })).toBeVisible()

  await organizer.reload()
  const organizerTeam = organizer.getByTestId('organizer-team')
  await expect(organizerTeam.getByText('создатель', { exact: true })).toHaveCount(1)
  await expect(organizerTeam.getByText('организатор', { exact: true })).toHaveCount(1)
  await expect(organizerTeam.getByText('ожидает принятия', { exact: true })).toHaveCount(0)
  await expect(organizerTeam.getByText('Приглашение ещё не принято')).toHaveCount(0)
  await expect(organizerTeam).not.toContainText('@')
  await expect(organizerTeam).not.toContainText('/organizer/')

  await assistant.reload()
  const assistantTeam = assistant.getByTestId('organizer-team')
  await expect(assistantTeam.getByText('создатель', { exact: true })).toHaveCount(1)
  await expect(assistantTeam.getByText('организатор', { exact: true })).toHaveCount(1)
  await expect(assistantTeam.getByText('ожидает принятия', { exact: true })).toHaveCount(0)

  await organizerContext.close()
  await assistantContext.close()
})

test('my games copies an absolute game link from the cabinet', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  const title = 'Игра с кабинетной ссылкой'

  await page.goto('/new')
  const origin = await page.evaluate(() => window.location.origin)
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })

  await page.getByLabel('Название').fill(title)
  await page.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(page).toHaveURL(/\/game\/[^/]+$/)
  const gameToken = new URL(page.url()).pathname.split('/').pop()
  await expect(page.getByLabel('Формат')).toHaveCSS('color-scheme', 'dark')
  await expectDateFieldTheme(page, 'dark', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.15)', '%23cbd5e1')

  await page.goto('/my')
  await expect(page).toHaveURL(/\/my$/)
  await expect(page.getByRole('heading', { name: 'Мои игры и обмены' })).toBeVisible()
  await expect(page.getByText(/\/game\/[0-9a-f-]/i)).toHaveCount(0)

  const copyButton = page.getByRole('button', { name: `Скопировать ссылку на игру ${title}` })
  await expect(copyButton).toBeVisible()
  await expect(copyButton).toHaveText(`Скопировать ссылку на игру ${title}`)
  await expect(copyButton).not.toHaveAttribute('aria-label')
  expect(await copyButton.evaluate((element) => element.tagName)).toBe('BUTTON')
  expect(await copyButton.evaluate((element) => element.querySelector('button, a, [role="button"]') !== null)).toBe(
    false,
  )

  await copyButton.click()
  await expect(page.getByText('Не удалось скопировать ссылку')).toHaveCount(0)
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  expect(clipboard).toBe(`${origin}/game/${gameToken}`)

  await context.close()
})

test('anonymous access is restored from a recovery code in a clean context', async ({ browser }) => {
  const ownerContext = await browser.newContext()
  const owner = await ownerContext.newPage()
  const title = 'Игра с восстановлением доступа'

  await owner.goto('/new')
  const origin = await owner.evaluate(() => window.location.origin)
  await ownerContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin })

  await owner.getByLabel('Название').fill(title)
  await owner.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(owner).toHaveURL(/\/game\//)

  await owner.goto('/my')
  const ownerCodes = owner.getByRole('region', { name: 'Код восстановления' })
  const copyButton = ownerCodes.getByRole('button', { name: 'Скопировать код восстановления' }).first()
  await expect(ownerCodes.getByRole('button', { name: 'Скопировать код восстановления' })).toHaveCount(1)
  await expect(copyButton).toHaveText('Скопировать код восстановления')
  await expect(copyButton).not.toHaveAttribute('aria-label')
  await copyButton.click()
  const recoveryCode = await owner.evaluate(() => navigator.clipboard.readText())
  expect(recoveryCode).toMatch(/^[0-9A-F]{32}$/)
  const ownerGameButton = owner.getByRole('button', { name: `Открыть игру ${title}` })
  const ownerGameCard = ownerGameButton.locator('xpath=..')
  await expect(ownerGameButton).toBeVisible()
  await expect(ownerGameButton).toHaveText(`Открыть игру ${title}`)
  await expect(ownerGameButton).not.toHaveAttribute('aria-label')
  await expect(ownerGameCard.getByText('создатель', { exact: true })).toBeVisible()
  await ownerGameButton.click()
  await expect(owner).toHaveURL(/\/game\//)
  await ownerContext.close()

  const cleanContext = await browser.newContext()
  const restored = await cleanContext.newPage()

  await restored.goto('/my')
  await expect(restored.getByRole('textbox', { name: 'Код восстановления' })).toHaveAttribute(
    'placeholder',
    'A1B2C3D4E5F60718293A4B5C6D7E8F90',
  )
  await expect(
    restored
      .getByRole('textbox', { name: 'Код восстановления' })
      .locator('..')
      .getByText('Код восстановления', { exact: true }),
  ).toBeVisible()
  await expect(restored.getByRole('heading', { name: 'Мои игры и обмены' })).toBeVisible()
  await expect(restored.getByRole('button', { name: `Открыть игру ${title}` })).toHaveCount(0)

  const recoveryResponsePromise = restored.waitForResponse(
    (response) => response.url().includes('/api/auth/recovery') && response.request().method() === 'POST',
  )
  await restored.getByRole('textbox', { name: 'Код восстановления' }).fill(recoveryCode)
  await restored.getByRole('button', { name: 'Восстановить доступ' }).click()
  const recoveryResponse = await recoveryResponsePromise
  expect(recoveryResponse.status()).toBe(200)

  await expect(restored.getByRole('button', { name: `Открыть игру ${title}` })).toBeVisible()
  const restoredCodes = restored.getByRole('region', { name: 'Код восстановления' })
  await expect(restoredCodes.getByRole('button', { name: 'Скопировать код восстановления' })).toHaveCount(1)
  const restoredCodeValues = await restoredCodes.locator('code').allInnerTexts()
  expect(restoredCodeValues.map((value) => value.trim())).not.toContain(recoveryCode)
  expect(restoredCodeValues[0].trim()).toMatch(/^[0-9A-F]{32}$/)

  await cleanContext.close()
})

test('login clears recovery codes and logout starts a fresh anonymous session', async ({ browser, request }) => {
  const email = 'session-switch@example.test'
  const password = 'secret123'
  const account = await request.post('/api/auth/register', { data: { email, password } })
  expect(account.ok()).toBeTruthy()

  const context = await browser.newContext()
  const page = await context.newPage()
  const title = 'Игра со сменой доступа'

  await page.goto('/new')
  await page.getByLabel('Название').fill(title)
  await page.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(page).toHaveURL(/\/game\//)

  await page.goto('/my')
  await expect(page.getByLabel('Email')).toHaveAttribute('placeholder', 'name@example.com')
  await expect(page.getByLabel('Пароль')).toHaveAttribute('placeholder', 'Например, СинийЗонт2026')
  await expect(page.getByText('Email', { exact: true })).toBeVisible()
  await expect(page.getByText('Пароль', { exact: true })).toBeVisible()
  const codes = page.getByRole('region', { name: 'Код восстановления' })
  await expect(codes.getByRole('button', { name: 'Скопировать код восстановления' })).toHaveCount(1)
  const oldCodes = (await codes.locator('code').allInnerTexts()).map((value) => value.trim())
  expect(oldCodes[0]).toMatch(/^[0-9A-F]{32}$/)
  await expect(page.getByRole('button', { name: `Открыть игру ${title}` })).toBeVisible()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill(password)
  await page.getByRole('button', { name: 'Войти' }).click()

  await expect(page.getByText(`Вы вошли как ${email}`)).toBeVisible()
  await expect(codes).toHaveCount(0)
  await expect(page.getByRole('button', { name: `Открыть игру ${title}` })).toHaveCount(0)

  await page.getByRole('button', { name: 'Выйти' }).click()

  const freshCodes = page.getByRole('region', { name: 'Код восстановления' })
  await expect(freshCodes.getByRole('button', { name: 'Скопировать код восстановления' })).toHaveCount(1)
  const freshCodeValues = (await freshCodes.locator('code').allInnerTexts()).map((value) => value.trim())
  expect(freshCodeValues[0]).toMatch(/^[0-9A-F]{32}$/)
  expect(freshCodeValues).not.toEqual(oldCodes)
  await expect(page.getByRole('button', { name: `Открыть игру ${title}` })).toHaveCount(0)

  await context.close()
})

test('clipboard failure stays local to each copy button', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    window.__clipboardFail = true
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          if (window.__clipboardFail) {
            throw new Error('отказ')
          }
        },
      },
    })
  })
  const page = await context.newPage()
  const title = 'Игра с недоступным буфером'

  await page.goto('/new')
  await page.getByLabel('Название').fill(title)
  await page.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(page).toHaveURL(/\/game\//)

  await page.goto('/my')
  const gamesHeading = page.getByRole('heading', { name: 'Игры', exact: true })
  await expect(gamesHeading).toBeVisible()

  const gameButton = page.getByRole('button', { name: `Открыть игру ${title}` })
  const gameCard = gameButton.locator('xpath=..')
  const copyLinkButton = gameCard.getByRole('button', { name: /Скопировать ссылку на игру/ })
  await copyLinkButton.click()
  await expect(gamesHeading).toBeVisible()
  await expect(gameButton).toBeVisible()
  await expect(gameCard.getByText('Не удалось скопировать ссылку')).toBeVisible()

  const codesRegion = page.getByRole('region', { name: 'Код восстановления' })
  const copyCodeButton = codesRegion.getByRole('button', { name: 'Скопировать код восстановления' }).first()
  const codeRow = copyCodeButton.locator('xpath=../..')
  await copyCodeButton.click()
  await expect(gamesHeading).toBeVisible()
  await expect(codeRow.getByText('Не удалось скопировать код')).toBeVisible()

  await page.evaluate(() => {
    window.__clipboardFail = false
  })
  await copyLinkButton.click()
  await expect(gameCard.getByText('Не удалось скопировать ссылку')).toHaveCount(0)
  await expect(gameCard.getByText('Скопировано')).toBeVisible()
  await expect(codeRow.getByText('Не удалось скопировать код')).toBeVisible()

  await context.close()
})

test('game copy links show local clipboard status', async ({ browser }) => {
  const context = await browser.newContext()
  await context.addInitScript(() => {
    window.__clipboardFail = true
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          if (window.__clipboardFail) {
            throw new Error('отказ')
          }
        },
      },
    })
  })
  const page = await context.newPage()
  const title = 'Игра с локальным статусом копирования'

  await page.goto('/new')
  await page.getByLabel('Название').fill(title)
  await page.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(page).toHaveURL(/\/game\//)

  await expect(page.getByText('Имя участника', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Имя участника')).toHaveAttribute('placeholder', 'Аня')
  await page.getByLabel('Имя участника').fill('Аня')
  await page.getByRole('button', { name: 'Добавить', exact: true }).click()

  const gameHeading = page.getByRole('heading', { name: title, level: 1 })
  await expect(gameHeading).toBeVisible()

  const inviteButton = page.getByRole('button', { name: 'Скопировать ссылку-приглашение для Аня' })
  const inviteRow = inviteButton.locator('xpath=..')
  await expect(inviteButton).toBeVisible()
  await inviteButton.click()
  await expect(gameHeading).toBeVisible()
  await expect(inviteRow.getByText('Не удалось скопировать ссылку')).toBeVisible()

  await page.evaluate(() => {
    window.__clipboardFail = false
  })
  await inviteButton.click()
  await expect(inviteRow.getByText('Не удалось скопировать ссылку')).toHaveCount(0)
  await expect(inviteRow.getByText('Скопировано')).toBeVisible()

  await context.close()
})

test('support form sends two requests in one session', async ({ page }) => {
  await page.goto('/support')
  await expect(page.getByText('Опишите ситуацию — если вы укажете почту, мы ответим на неё.')).toBeVisible()

  const email = page.getByLabel('Email для ответа')
  const subject = page.getByLabel('Тема')
  const body = page.getByLabel('Сообщение')
  const confirmation = page.getByText('Обращение отправлено. Если вы указали email, мы ответим на него.')

  await expect(page.getByText('Email для ответа', { exact: true })).toBeVisible()
  await expect(email).toHaveAttribute('placeholder', 'name@example.com')
  await expect(subject).toHaveAttribute('placeholder', 'Вопрос по игре')
  await expect(body).toHaveAttribute('placeholder', 'Не пришло приглашение, подскажите, что делать')

  await subject.fill('Первый вопрос')
  await body.fill('Первое обращение')
  const firstResponse = page.waitForResponse(
    (response) => response.url().includes('/api/support') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Отправить обращение' }).click()
  const first = await firstResponse
  expect(first.status()).toBe(201)
  expect(JSON.parse(first.request().postData() ?? '{}')).toEqual({
    subject: 'Первый вопрос',
    body: 'Первое обращение',
  })
  await expect(confirmation).toBeVisible()
  await expect(page.getByRole('button', { name: 'Написать ещё' })).toBeVisible()

  await page.getByRole('button', { name: 'Написать ещё' }).click()
  await expect(email).toHaveValue('')
  await expect(subject).toHaveValue('')
  await expect(body).toHaveValue('')
  await expect(confirmation).toHaveCount(0)

  await email.fill('user@example.test')
  await subject.fill('Второй вопрос')
  await body.fill('Второе обращение')
  const secondResponse = page.waitForResponse(
    (response) => response.url().includes('/api/support') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Отправить обращение' }).click()
  const second = await secondResponse
  expect(second.status()).toBe(201)
  expect(JSON.parse(second.request().postData() ?? '{}')).toEqual({
    email: 'user@example.test',
    subject: 'Второй вопрос',
    body: 'Второе обращение',
  })
  await expect(confirmation).toBeVisible()
})

test('randomizer draws pairs and reports clipboard status', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] })
  await context.addInitScript(() => {
    window.__clipboardFail = false
    const nativeWriteText = navigator.clipboard.writeText.bind(navigator.clipboard)
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (text) => {
        if (window.__clipboardFail) {
          throw new Error('отказ')
        }
        return nativeWriteText(text)
      },
    })
  })
  const page = await context.newPage()

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'тайный санта.' })).toBeVisible()
  const quickDrawLink = page.getByRole('main').getByRole('link', { name: 'Быстрая жеребьёвка' })
  await expect(quickDrawLink).toBeVisible()
  await quickDrawLink.click()
  await expect(page).toHaveURL(/\/randomizer/)
  await expect(
    page
      .locator('label')
      .filter({ has: page.getByPlaceholder('Аня, Борис, Вика') })
      .locator('span')
      .getByText('Имена участников', { exact: true }),
  ).toBeVisible()
  await page.getByPlaceholder('Аня, Борис, Вика').fill('Аня, Борис, Вика')
  await page.getByRole('button', { name: 'Перемешать' }).click()

  const pairItems = page.locator('ol li')
  await expect(pairItems).toHaveCount(3)
  const pairTexts = (await pairItems.allTextContents()).map((text) => text.trim())
  expect(pairTexts.map((text) => text.split(' → ')[0]).sort()).toEqual(['Аня', 'Борис', 'Вика'])
  expect(pairTexts.map((text) => text.split(' → ')[1]).sort()).toEqual(['Аня', 'Борис', 'Вика'])

  const copyButton = page.getByRole('button', { name: 'Скопировать' })
  await copyButton.click()
  await expect(page.getByText('Скопировано')).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(pairTexts.join('\n'))

  await page.evaluate(() => {
    window.__clipboardFail = true
  })
  await copyButton.click()
  await expect(page.getByText('Не удалось скопировать результат')).toBeVisible()
  await expect(pairItems).toHaveCount(3)
  expect((await pairItems.allTextContents()).map((text) => text.trim())).toEqual(pairTexts)

  await context.close()
})

test('tenant warning stays on game route and clears in the cabinet', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('/new')
  await page.getByLabel('Название').fill('Игра с предупреждением')
  await page.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(page).toHaveURL(/\/game\//)

  await page.route('**/api/tenants/current', (route) => route.abort())
  await page.reload()

  const warning = page.getByText('Не удалось проверить адрес игры. Данные на странице могут быть неактуальны.')
  await expect(warning).toBeVisible()
  await expect(page).toHaveURL(/\/game\//)

  await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('button', { name: 'Мои игры' }).click()
  await expect(page).toHaveURL(/\/my$/)
  await expect(warning).toHaveCount(0)

  await context.close()
})

test('organizer creates a choice question through the game form', async ({ browser }) => {
  const organizerContext = await browser.newContext()
  const organizer = await organizerContext.newPage()

  await organizer.goto('/new')
  await organizer.getByLabel('Название').fill('Игра с вариантами вопроса')
  await organizer.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(organizer).toHaveURL(/\/game\//)

  await expect(organizer.getByText('Название вопроса', { exact: true })).toBeVisible()
  await expect(organizer.getByText('Подсказка', { exact: true })).toBeVisible()
  await expect(organizer.getByText('Тип вопроса', { exact: true })).toBeVisible()
  await expect(organizer.getByLabel('Название вопроса')).toHaveAttribute('placeholder', 'Любимый цвет')
  await expect(organizer.getByLabel('Подсказка')).toHaveAttribute('placeholder', 'Например, синий')
  await organizer.getByLabel('Название вопроса').fill('Любимый цвет')
  await organizer.getByLabel('Подсказка').fill('Например, синий')
  await organizer.getByLabel('Тип вопроса').selectOption('single')
  await expect(organizer.getByText('Варианты через запятую', { exact: true })).toBeVisible()
  await expect(organizer.getByLabel('Варианты через запятую')).toHaveAttribute('placeholder', 'Синий, Зелёный, Красный')
  await organizer.getByLabel('Варианты через запятую').fill('Синий, Зелёный, Красный')
  await organizer.getByRole('button', { name: 'Добавить вопрос' }).click()
  await expect(organizer.getByText('Любимый цвет · Один выбор')).toBeVisible()
  await organizer.getByLabel('Название вопроса').fill('Любимые цвета')
  await organizer.getByLabel('Подсказка').fill('Например, синий и зелёный')
  await organizer.getByLabel('Тип вопроса').selectOption('multi')
  await organizer.getByLabel('Варианты через запятую').fill('Синий, Зелёный, Красный')
  await organizer.getByRole('button', { name: 'Добавить вопрос' }).click()
  await expect(organizer.getByText('Любимые цвета · Несколько')).toBeVisible()

  const commonButton = organizer.getByRole('button', { name: 'Скопировать общую ссылку на игру' })
  await expect(commonButton).toBeVisible()
  await expect(commonButton).toHaveText('Скопировать общую ссылку на игру')
  await expect(commonButton).not.toHaveAttribute('aria-label')
  const commonUrl = String(await commonButton.locator('xpath=..').locator('span').textContent()).trim()
  const commonPath = commonUrl.startsWith('http') ? new URL(commonUrl).pathname : commonUrl

  const joinerContext = await browser.newContext()
  const joiner = await joinerContext.newPage()
  await joiner.goto(commonPath)
  await joiner.getByLabel('Ваше имя').fill('Маша')
  await joiner.getByRole('button', { name: 'Присоединиться' }).click()
  await expect(joiner).toHaveURL(/\/join\//)
  await expect(joiner.getByText('Например, синий', { exact: true })).toHaveCount(1)
  await expect(joiner.getByText('Синий, Зелёный, Красный')).toHaveCount(0)
  await expect(joiner.getByText('Выберите подходящий вариант')).toHaveCount(2)
  await expect(joiner.getByRole('group', { name: 'Любимые цвета' })).toBeVisible()
  for (const option of ['Синий', 'Зелёный', 'Красный']) {
    const checkbox = joiner.getByRole('checkbox', { name: option })
    await expect(checkbox).not.toHaveAttribute('aria-label')
    await expect(checkbox.locator('..')).toHaveText(option)
  }
  await expect(joiner.getByRole('combobox', { name: 'Любимый цвет' }).locator('option')).toHaveText([
    'Не выбрано',
    'Синий',
    'Зелёный',
    'Красный',
  ])

  await joiner.getByLabel('Любимый цвет').selectOption('Зелёный')
  await joiner.getByRole('checkbox', { name: 'Синий' }).check()
  await joiner.getByRole('checkbox', { name: 'Красный' }).check()
  await joiner.getByRole('button', { name: 'Сохранить ответы' }).click()
  await expect(joiner.getByRole('combobox', { name: 'Любимый цвет' })).toHaveValue('Зелёный')
  await expect(joiner.getByRole('checkbox', { name: 'Синий' })).toBeChecked()
  await expect(joiner.getByRole('checkbox', { name: 'Красный' })).toBeChecked()
  await joiner.reload()
  await expect(joiner.getByRole('combobox', { name: 'Любимый цвет' })).toHaveValue('Зелёный')
  await expect(joiner.getByRole('checkbox', { name: 'Синий' })).toBeChecked()
  await expect(joiner.getByRole('checkbox', { name: 'Красный' })).toBeChecked()
  await expect(joiner.getByRole('checkbox', { name: 'Зелёный' })).not.toBeChecked()

  await organizerContext.close()
  await joinerContext.close()
})

test('mobile menu button has a visible name and toggles navigation', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()

  await page.goto('/')
  const menuButton = page.getByRole('button', { name: 'Меню', exact: true })
  await expect(menuButton).toBeVisible()
  await expect(menuButton).toHaveText('Меню')
  await expect(menuButton).not.toHaveAttribute('aria-label')
  await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toHaveCount(0)

  await menuButton.click()
  await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toBeVisible()
  const closeButton = page.getByRole('button', { name: 'Закрыть', exact: true })
  await expect(closeButton).toBeVisible()
  await expect(closeButton).toHaveText('Закрыть')
  await expect(closeButton).not.toHaveAttribute('aria-label')

  await closeButton.click()
  await expect(page.getByRole('navigation', { name: 'Мобильная навигация' })).toHaveCount(0)
  await context.close()
})
