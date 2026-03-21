import { db } from '../db/database'
import { supabase } from '../lib/supabase'
import { syncStudyLog } from './supabaseSync'

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
  const log = {
    leapNumber,
    word,
    eventType,
    mode,
    timestamp: now.getTime(),
    hour: now.getHours(),
    responseTime,
    hintUsed,
  }
  try {
    await db.study_logs.add(log)
  } catch (err) { console.warn('[Vocaleap] 学習ログ保存失敗:', err) }

  // Supabase同期（fire-and-forget）
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session?.user?.id) syncStudyLog(session.user.id, log)
  })
}
