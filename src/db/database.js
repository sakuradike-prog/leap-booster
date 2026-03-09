import Dexie from 'dexie'

export const db = new Dexie('LeapBoosterDB')

db.version(1).stores({
  words: '++id, word, leapPart, leapNumber',
  cards: '++id, wordId, lastReviewed',
  challengeHistory: '++id, date, cleared',
  warmupHistory: '++id, date, wordId',
  userStats: 'id',
  warmupSentences: '++id, wordId',
})

db.version(2).stores({
  // familyId インデックス追加
  words: '++id, word, leapPart, leapNumber, familyId',
  // 語族マスタ（id, root, rootMeaning）
  wordFamilies: '++id, root',
})
