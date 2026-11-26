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
