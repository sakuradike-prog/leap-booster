import Dexie from 'dexie'

export const db = new Dexie('LeapBoosterDB')

db.version(1).stores({
  // 単語データ
  words: '++id, word, leapPart, leapNumber',

  // 各単語の学習状態
  cards: '++id, wordId, lastReviewed',

  // 30問チャレンジの記録
  challengeHistory: '++id, date, cleared',

  // 瞬間英作文の記録
  warmupHistory: '++id, date, wordId',

  // ポイント・ストリーク（1レコードのみ）
  userStats: 'id',

  // 瞬間英作文の例文（事前生成）
  warmupSentences: '++id, wordId',
})
