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
  await expect(organizer.getByLabel('Формат')).toHaveCSS('color-scheme', 'light')
  await expectDateFieldTheme(organizer, 'light', 'rgba(255, 255, 255, 0.65)', 'rgba(15, 23, 42, 0.16)', '%23334155')
  await expect(organizer.locator('.theme-decor--winter').first()).toBeVisible()
  await organizer.getByLabel('Название').fill('Браузерная игра')
  await organizer.getByRole('main').getByRole('button', { name: 'Создать игру' }).click()
  await expect(organizer).toHaveURL(/\/game\//)
  await expect(organizer.getByRole('heading', { name: 'Браузерная игра' })).toBeVisible()

  await organizer.getByLabel('Список имён через запятую').fill('Аня, Борис')
  await organizer.getByRole('button', { name: 'Добавить список' }).click()

  const aniaLink = organizer.getByRole('button', { name: 'Ссылка-приглашение для Аня' })
  const borisLink = organizer.getByRole('button', { name: 'Ссылка-приглашение для Борис' })
  await expect(aniaLink).toBeVisible()
  await expect(borisLink).toBeVisible()
  const aniaUrl = (await aniaLink.textContent()).trim()
  const borisUrl = (await borisLink.textContent()).trim()

  const aniaContext = await browser.newContext()
  const ania = await aniaContext.newPage()
  await ania.goto(aniaUrl)
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

  await ania.getByLabel('Текст сообщения').fill('Привет, Борис!')
  await ania.getByRole('button', { name: 'Отправить' }).click()
  await expect(ania.getByText('Привет, Борис!')).toBeVisible()

  await boris.reload()
  await expect(boris.getByText('Привет, Борис!')).toBeVisible()

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
  await organizer.getByRole('button', { name: 'Добавить вопрос' }).click()
  await expect(organizer.getByText('Любите ли вы читать? · Да/Нет')).toBeVisible()

  const commonButton = organizer.getByRole('button', { name: /Общая ссылка на игру:/ })
  await expect(commonButton).toBeVisible()
  const commonLabel = String(await commonButton.getAttribute('aria-label'))
  const commonUrl = commonLabel.replace(/^Общая ссылка на игру:\s*/, '')
  const commonPath = commonUrl.startsWith('http') ? new URL(commonUrl).pathname : commonUrl

  const joinerContext = await browser.newContext()
  const joiner = await joinerContext.newPage()
  await joiner.goto(commonPath)
  await expect(joiner.getByText('Присоединиться к игре')).toBeVisible()
  await joiner.getByLabel('Ваше имя').fill('Глупое имя')
  await joiner.getByRole('button', { name: 'Присоединиться' }).click()
  await expect(joiner).toHaveURL(/\/join\//)
  await expect(joiner.getByRole('heading', { name: 'Анкета' })).toBeVisible()
  await joiner.getByLabel('Любите ли вы читать?').selectOption('да')
  await joiner.getByRole('button', { name: 'Сохранить ответы' }).click()
  await expect(joiner.getByRole('combobox', { name: 'Любите ли вы читать?' })).toHaveValue('да')

  await joiner.getByLabel('Желания').fill('Книга')
  await joiner.getByRole('button', { name: 'Подтвердить участие' }).click()
  await expect(joiner.getByText('Вы в игре')).toBeVisible()

  await organizer.reload()
  const badInvite = organizer.getByRole('button', { name: 'Ссылка-приглашение для Глупое имя' })
  await expect(badInvite).toBeVisible()
  await organizer.getByRole('button', { name: /Глупое имя участвует/ }).click()
  organizer.once('dialog', (dialog) => dialog.accept())
  await organizer.getByRole('button', { name: 'Удалить участника Глупое имя' }).click()
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
  await expect(organizer.getByRole('button', { name: 'Ссылка-приглашение для Вера' })).toBeVisible()

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
  await expect(page.getByLabel('Формат игры')).toHaveCSS('color-scheme', 'dark')
  await expectDateFieldTheme(page, 'dark', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.15)', '%23cbd5e1')

  await page.goto('/my')
  await expect(page).toHaveURL(/\/my$/)
  await expect(page.getByRole('heading', { name: 'Мои игры и обмены' })).toBeVisible()
  await expect(page.getByText(/\/game\/[0-9a-f-]/i)).toHaveCount(0)

  const copyButton = page.getByRole('button', { name: `Скопировать ссылку на игру ${title}` })
  await expect(copyButton).toBeVisible()
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
  const ownerCodes = owner.getByRole('region', { name: 'Коды восстановления' })
  const copyButton = ownerCodes.getByRole('button', { name: /Скопировать код восстановления/ }).first()
  await expect(ownerCodes.getByRole('button', { name: /Скопировать код восстановления/ })).toHaveCount(5)
  await copyButton.click()
  const recoveryCode = await owner.evaluate(() => navigator.clipboard.readText())
  expect(recoveryCode).toMatch(/^[0-9A-F]{10}$/)
  await expect(owner.getByRole('button', { name: `Открыть игру ${title}` })).toBeVisible()
  await ownerContext.close()

  const cleanContext = await browser.newContext()
  const restored = await cleanContext.newPage()

  await restored.goto('/my')
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
  const restoredCodes = restored.getByRole('region', { name: 'Коды восстановления' })
  await expect(restoredCodes.getByRole('button', { name: /Скопировать код восстановления/ })).toHaveCount(5)
  const restoredCodeValues = await restoredCodes.locator('code').allInnerTexts()
  expect(restoredCodeValues.map((value) => value.trim())).not.toContain(recoveryCode)

  await cleanContext.close()
})
