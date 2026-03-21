import { db } from '../db/database'

/**
 * 学習ログを1件記録する
 * @param {object} p
 * @param {number}  p.leapNumber
 * @param {string}  p.word
 * @param {string}  p.eventType  'studied' | 'correct' | 'incorrect'
 * @param {string}  p.mode       'challenge' | 'practice' | 'warmup'
 * @param {number|null} p.responseTime  秒数（null可）
 * @param {number|null} p.hintUsed      0/1/2（null可）
 */
export async function addStudyLog({ leapNumber, word, eventType, mode, responseTime = null, hintUsed = null }) {
  const now = new Date()
  try {
    await db.study_logs.add({
      leapNumber,
      word,
      eventType,
      mode,
      timestamp: now.getTime(),
      hour: now.getHours(),
      responseTime,
      hintUsed,
    })
  } catch (err) { console.warn('[Vocaleap] 学習ログ保存失敗:', err) }
}
