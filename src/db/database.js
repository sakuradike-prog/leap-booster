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

db.version(7).stores({
  // words に sourceBook インデックス追加（'old' | 'new'）
  // 旧版と改訂版が混在しても正しくフィルタリングできるようにする
  words: '++id, word, leapPart, leapNumber, familyId, sourceBook',
})

db.version(8).stores({
  // 4択練習完了履歴（ヒートマップ用、セッション開始ではなく完了時に記録）
  dailyQuizHistory: '++id, date',
})

db.version(9).stores({
  // チェックした単語（単語解説画面でブックマーク的に使う）
  checked_words: '++id, leapNumber, checkedAt',
})

db.version(10).stores({
  // week_points / week_start_date を userStats に追加（非インデックス項目のためスキーマ変更なし）
  // スムーズなマイグレーションのため空upgradeを定義
}).upgrade(() => {
  // no-op: week_points / week_start_date は非インデックスなのでDBスキーマ変更不要
})

db.version(11).stores({
  // cards に spellCorrectCount / spellIncorrectCount を追加（非インデックス項目）
  // スキーマ変更なし: 既存データは undefined → ?? 0 で扱う
  cards: '++id, wordId, lastReviewed',
}).upgrade(() => {
  // no-op: 非インデックスフィールドなのでDBスキーマ変更不要
})
