import { supabase } from '../lib/supabase'

// ローカル（camelCase）→ Supabase（snake_case）変換
function toRemote(userId, stats) {
  const toDateStr = (v) => {
    if (!v) return null
    const d = new Date(v)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }
  return {
    user_id: userId,
    total_points: stats.totalPoints ?? 0,
    current_streak: stats.currentStreak ?? 0,
    longest_streak: stats.longestStreak ?? 0,
    last_study_date: toDateStr(stats.lastStudyDate),
    challenge_clear_count: stats.challengeClearCount ?? 0,
    challenge_last_date: toDateStr(stats.challengeLastDate),
    daily_quiz_last_date: toDateStr(stats.dailyQuizLastDate),
    freeze_count: stats.freezeCount ?? 0,
    today_points: stats.todayPoints ?? 0,
    today_points_date: toDateStr(stats.todayPointsDate),
    updated_at: new Date().toISOString(),
  }
}

// Supabase（snake_case）→ ローカル（camelCase）変換
export function fromRemote(remote) {
  const toDate = (v) => v ? new Date(v) : null
  return {
    id: 1,
    totalPoints: remote.total_points ?? 0,
    currentStreak: remote.current_streak ?? 0,
    longestStreak: remote.longest_streak ?? 0,
    lastStudyDate: toDate(remote.last_study_date),
    challengeClearCount: remote.challenge_clear_count ?? 0,
    challengeLastDate: toDate(remote.challenge_last_date),
    dailyQuizLastDate: toDate(remote.daily_quiz_last_date),
    freezeCount: remote.freeze_count ?? 0,
    todayPoints: remote.today_points ?? 0,
    todayPointsDate: toDate(remote.today_points_date),
  }
}

/** user_statsをSupabaseにupsert（fire-and-forget用） */
export async function syncUserStats(userId, stats) {
  if (!userId) return
  try {
    const { error } = await supabase
      .from('user_stats')
      .upsert(toRemote(userId, stats), { onConflict: 'user_id' })
    if (error) console.warn('[Vocaleap] user_stats sync失敗:', error.message)
  } catch (err) {
    console.warn('[Vocaleap] user_stats sync例外:', err)
  }
}

/** Supabaseからuser_statsを取得 */
export async function fetchUserStats(userId) {
  if (!userId) return null
  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

/** study_log 1件をSupabaseに送る（fire-and-forget用） */
export async function syncStudyLog(userId, log) {
  if (!userId) return
  try {
    const { error } = await supabase.from('study_logs').insert({
      user_id: userId,
      leap_number: log.leapNumber ?? null,
      event_type: log.eventType ?? null,
      mode: log.mode ?? null,
      timestamp: log.timestamp ? new Date(log.timestamp).toISOString() : new Date().toISOString(),
      hour: log.hour ?? new Date().getHours(),
    })
    if (error) console.warn('[Vocaleap] study_log sync失敗:', error.message)
  } catch (err) {
    console.warn('[Vocaleap] study_log sync例外:', err)
  }
}

/** display_nameをSupabaseに保存（ニックネーム） */
export async function syncDisplayName(userId, displayName) {
  if (!userId) return
  try {
    const { error } = await supabase
      .from('user_stats')
      .upsert({ user_id: userId, display_name: displayName }, { onConflict: 'user_id' })
    if (error) console.warn('[Vocaleap] display_name sync失敗:', error.message)
  } catch (err) {
    console.warn('[Vocaleap] display_name sync例外:', err)
  }
}

/** ランキング用：全ユーザーのstatsを取得（認証済みユーザーのみ閲覧可） */
export async function fetchRankings() {
  try {
    const { data, error } = await supabase
      .from('user_stats')
      .select('user_id, display_name, total_points, current_streak, longest_streak, challenge_clear_count, last_study_date, today_points, today_points_date')
      .limit(200)
    if (error) { console.warn('[Vocaleap] rankings fetch失敗:', error.message); return [] }
    return data ?? []
  } catch {
    return []
  }
}

/** session_log 1件をSupabaseに送る（fire-and-forget用） */
export async function syncSessionLog(userId, session) {
  if (!userId) return
  try {
    const { error } = await supabase.from('session_logs').insert({
      user_id: userId,
      date: session.date ?? null,
      mode: session.mode ?? null,
      start_time: session.startTime
        ? new Date(session.startTime).toISOString()
        : new Date().toISOString(),
    })
    if (error) console.warn('[Vocaleap] session_log sync失敗:', error.message)
  } catch (err) {
    console.warn('[Vocaleap] session_log sync例外:', err)
  }
}
