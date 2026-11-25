export const participants = [
  { id: 1, name: 'Ольга', filled: true, knows: true, sent: true, received: false },
  { id: 2, name: 'Михаил', filled: true, knows: true, sent: true, received: true },
  { id: 3, name: 'Анна', filled: true, knows: true, sent: false, received: true },
  { id: 4, name: 'Борис', filled: true, knows: true, sent: true, received: false },
  { id: 5, name: 'Вера', filled: true, knows: true, sent: false, received: false },
  { id: 6, name: 'Глеб', filled: true, knows: true, sent: true, received: false },
  { id: 7, name: 'Дарья', filled: true, knows: true, sent: false, received: false },
  { id: 8, name: 'Илья', filled: true, knows: true, sent: false, received: false },
  { id: 9, name: 'Ксения', filled: false, knows: true, sent: false, received: false },
  { id: 10, name: 'Никита', filled: false, knows: false, sent: false, received: false },
  { id: 11, name: 'Полина', filled: false, knows: false, sent: false, received: false },
  { id: 12, name: 'Артём', filled: false, knows: false, sent: false, received: false },
]

export const history = [
  { text: 'Ольга присоединилась к игре', time: '25 ноября, 14:30', kind: 'join' },
  { text: 'Вы изменили настройки игры', time: '25 ноября, 12:15', kind: 'settings' },
  { text: 'Михаил отправил подарок', time: '24 ноября, 18:00', kind: 'gift' },
  { text: 'Анна получила подарок', time: '23 ноября, 11:00', kind: 'gift' },
  { text: 'Жеребьёвка подтверждена', time: '20 ноября, 09:40', kind: 'draw' },
]
