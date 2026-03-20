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

db.version(4).stores({
  // cards に studyCount フィールドを追加（インデックス不要・JS側でソート）
  // スキーマ変更なし: 既存データは studyCount=undefined → ?? 0 で扱う
  cards: '++id, wordId, lastReviewed',
})

db.version(5).stores({
  // 捕獲単語テーブル（LEAP以外で見かけた単語を登録）
  captured_words: '++id, leapNumber, word, capturedAt',
})

db.version(6).stores({
  study_logs:   '++id, leapNumber, eventType, mode, timestamp, hour',
  session_logs: '++id, date, mode, startTime',
})
