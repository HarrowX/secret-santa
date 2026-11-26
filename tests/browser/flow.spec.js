import { test, expect } from '@playwright/test'

test('organizer and anonymous participants complete the game in the browser', async ({ browser }) => {
  const organizerContext = await browser.newContext()
  const organizer = await organizerContext.newPage()

  await organizer.goto('/new')
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
