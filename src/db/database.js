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

db.version(3).stores({
  // warmupSentences: leapPart インデックスを追加（瞬間英作文のパート絞り込み用）
  warmupSentences: '++id, leapPart, word',
  // 語源マスタ（leap_roots.csv）
  roots: '++id, root',
})
