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

/** captured_words を全件取得 */
export async function fetchCapturedWords(userId) {
  if (!userId) return []
  try {
    const { data, error } = await supabase
      .from('captured_words')
      .select('*')
      .eq('user_id', userId)
    if (error) { console.warn('[Vocaleap] captured_words fetch失敗:', error.message); return [] }
    return data ?? []
  } catch { return [] }
}

/** captured_word 1件をupsert（leap_number で重複排除） */
export async function syncCapturedWord(userId, entry) {
  if (!userId) return
  try {
    const { error } = await supabase
      .from('captured_words')
      .upsert({
        user_id: userId,
        leap_number: entry.leapNumber,
        word: entry.word,
        memo: entry.memo ?? '',
        captured_at: entry.capturedAt
          ? new Date(entry.capturedAt).toISOString()
          : new Date().toISOString(),
      }, { onConflict: 'user_id,leap_number' })
    if (error) console.warn('[Vocaleap] captured_word sync失敗:', error.message)
  } catch (err) { console.warn('[Vocaleap] captured_word sync例外:', err) }
}

/** ローカル ↔ Supabase の captured_words を双方向マージ */
export async function mergeCapturedWords(userId, db) {
  if (!userId) return
  try {
    const remote = await fetchCapturedWords(userId)
    console.log('[Vocaleap] mergeCapturedWords: サーバー', remote.length, '件取得')
    const local  = await db.captured_words.toArray()

    // leapNumber 重複行をクリーンアップ（最古のidを残して削除）
    const seenLeap = new Map()
    for (const row of local) {
      if (seenLeap.has(row.leapNumber)) {
        await db.captured_words.delete(row.id)
      } else {
        seenLeap.set(row.leapNumber, row)
      }
    }
    const deduped = await db.captured_words.toArray()
    const localMap = new Map(deduped.map(r => [r.leapNumber, r]))

    // remote → local（新規 or より新しいものを取り込む）
    for (const rc of remote) {
      const lc = localMap.get(rc.leap_number)
      const remoteDate = rc.captured_at ? new Date(rc.captured_at) : null
      const localDate  = lc?.capturedAt  ? new Date(lc.capturedAt)  : null
      if (!lc) {
        await db.captured_words.add({
          leapNumber: rc.leap_number,
          word: rc.word,
          memo: rc.memo ?? '',
          capturedAt: remoteDate ?? new Date(),
          firstCapturedAt: remoteDate ?? new Date(),
        })
      } else if (remoteDate && (!localDate || remoteDate > localDate)) {
        await db.captured_words.update(lc.id, { memo: rc.memo ?? lc.memo, capturedAt: remoteDate })
      }
    }

    // local → remote（全件 upsert で漏れを補完）
    const allLocal = await db.captured_words.toArray()
    for (const lc of allLocal) {
      await syncCapturedWord(userId, lc)
    }
  } catch (err) { console.warn('[Vocaleap] mergeCapturedWords例外:', err) }
}

// ── 日付文字列ヘルパー（ローカル日付基準） ──────────────────────────────────
function toLocalDateStr(v) {
  const d = v ? new Date(v) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

// ── CARDS ────────────────────────────────────────────────────────────────────

/** cards 1件をSupabaseにupsert */
export async function syncCard(userId, leapNumber, word, card) {
  if (!userId || !leapNumber) return
  try {
    const { error } = await supabase.from('cards').upsert({
      user_id: userId,
      leap_number: leapNumber,
      word: word ?? '',
      study_count:     card.studyCount     ?? 0,
      correct_count:   card.correctCount   ?? 0,
      incorrect_count: card.incorrectCount ?? 0,
      last_reviewed: card.lastReviewed ? new Date(card.lastReviewed).toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,leap_number' })
    if (error) console.warn('[Vocaleap] card sync失敗:', error.message)
  } catch (err) { console.warn('[Vocaleap] card sync例外:', err) }
}

/** ログイン時：cards双方向マージ */
export async function mergeCards(userId, db) {
  if (!userId) return
  try {
    const { data: remote, error } = await supabase.from('cards').select('*').eq('user_id', userId)
    if (error) { console.warn('[Vocaleap] mergeCards fetch失敗:', error.message, error.code); return }
    if (!remote) { console.warn('[Vocaleap] mergeCards: remote null'); return }
    console.log('[Vocaleap] mergeCards: サーバー', remote.length, '件取得')

    const allWords = await db.words.toArray()
    const leapToWordId = {}, wordIdToLeap = {}, wordIdToText = {}
    for (const w of allWords) {
      leapToWordId[w.leapNumber] = w.id
      wordIdToLeap[w.id] = w.leapNumber
      wordIdToText[w.id] = w.word
    }

    const localCards = await db.cards.toArray()
    console.log('[Vocaleap] mergeCards: ローカル', localCards.length, '件')
    const localByLeap = {}
    for (const c of localCards) {
      const ln = wordIdToLeap[c.wordId]
      if (ln) localByLeap[ln] = c
    }

    // remote → local
    let added = 0, updated2 = 0
    for (const rc of remote) {
      const lc = localByLeap[rc.leap_number]
      if (!lc) {
        const wordId = leapToWordId[rc.leap_number]
        if (!wordId) continue
        await db.cards.add({
          wordId,
          studyCount:     rc.study_count     ?? 0,
          correctCount:   rc.correct_count   ?? 0,
          incorrectCount: rc.incorrect_count ?? 0,
          lastReviewed: rc.last_reviewed ? new Date(rc.last_reviewed) : null,
        }).catch(() => {})
        added++
      } else {
        const upd = {}
        if ((rc.study_count ?? 0) > (lc.studyCount ?? 0)) upd.studyCount = rc.study_count
        if ((rc.correct_count ?? 0) > (lc.correctCount ?? 0)) upd.correctCount = rc.correct_count
        if ((rc.incorrect_count ?? 0) > (lc.incorrectCount ?? 0)) upd.incorrectCount = rc.incorrect_count
        const rDate = rc.last_reviewed ? new Date(rc.last_reviewed) : null
        const lDate = lc.lastReviewed  ? new Date(lc.lastReviewed)  : null
        if (rDate && (!lDate || rDate > lDate)) upd.lastReviewed = rDate
        if (Object.keys(upd).length) { await db.cards.update(lc.id, upd).catch(() => {}); updated2++ }
      }
    }
    console.log('[Vocaleap] mergeCards: remote→local 追加', added, '件 / 更新', updated2, '件')

    // local → remote
    const allLocal = await db.cards.toArray()
    let pushed = 0, pushErr = 0
    for (const c of allLocal) {
      const ln = wordIdToLeap[c.wordId]
      if (!ln) continue
      const { error: e } = await supabase.from('cards').upsert({
        user_id: userId,
        leap_number: ln,
        word: wordIdToText[c.wordId] ?? '',
        study_count:     c.studyCount     ?? 0,
        correct_count:   c.correctCount   ?? 0,
        incorrect_count: c.incorrectCount ?? 0,
        last_reviewed: c.lastReviewed ? new Date(c.lastReviewed).toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,leap_number' })
      if (e) { console.warn('[Vocaleap] card push失敗:', e.message, e.code); pushErr++ }
      else pushed++
    }
    console.log('[Vocaleap] mergeCards: local→remote push', pushed, '件成功 /', pushErr, '件失敗')
  } catch (err) { console.warn('[Vocaleap] mergeCards例外:', err) }
}

// ── CHALLENGE HISTORY ─────────────────────────────────────────────────────────

/** challenge_history 1件をupsert */
export async function syncChallengeHistory(userId, entry) {
  if (!userId) return
  try {
    const { error } = await supabase.from('challenge_history').upsert({
      user_id:    userId,
      date:       toLocalDateStr(entry.date ?? new Date()),
      cleared:    entry.cleared ?? false,
      score:      entry.result  ?? 0,
      total_time: entry.totalTime ?? null,
    }, { onConflict: 'user_id,date' })
    if (error) console.warn('[Vocaleap] challenge_history sync失敗:', error.message)
  } catch (err) { console.warn('[Vocaleap] challenge_history sync例外:', err) }
}

/** ログイン時：challenge_history双方向マージ */
export async function mergeChallengeHistory(userId, db) {
  if (!userId) return
  try {
    const { data: remote, error } = await supabase.from('challenge_history').select('*').eq('user_id', userId)
    if (error || !remote) return

    const local = await db.challengeHistory.toArray()
    const localDates = new Set(local.map(e => toLocalDateStr(e.date)))

    for (const rc of remote) {
      if (!localDates.has(rc.date)) {
        await db.challengeHistory.add({
          date:      new Date(rc.date),
          result:    rc.score     ?? 0,
          cleared:   rc.cleared   ?? false,
          totalTime: rc.total_time ?? null,
        }).catch(() => {})
      }
    }

    // 日付ごとに最良スコアをupsert
    const all = await db.challengeHistory.toArray()
    const bestByDate = {}
    for (const e of all) {
      const ds = toLocalDateStr(e.date)
      if (!bestByDate[ds] || (e.result ?? 0) > (bestByDate[ds].result ?? 0)) bestByDate[ds] = e
    }
    for (const e of Object.values(bestByDate)) await syncChallengeHistory(userId, e)
  } catch (err) { console.warn('[Vocaleap] mergeChallengeHistory例外:', err) }
}

// ── WARMUP HISTORY ────────────────────────────────────────────────────────────

/** warmup_history 1件をupsert */
export async function syncWarmupHistory(userId, date) {
  if (!userId) return
  try {
    const { error } = await supabase.from('warmup_history').upsert(
      { user_id: userId, date: toLocalDateStr(date) },
      { onConflict: 'user_id,date' }
    )
    if (error) console.warn('[Vocaleap] warmup_history sync失敗:', error.message)
  } catch (err) { console.warn('[Vocaleap] warmup_history sync例外:', err) }
}

/** ログイン時：warmup_history双方向マージ */
export async function mergeWarmupHistory(userId, db) {
  if (!userId) return
  try {
    const { data: remote, error } = await supabase.from('warmup_history').select('*').eq('user_id', userId)
    if (error || !remote) return

    const local = await db.warmupHistory.toArray()
    const localDates = new Set(local.map(e => toLocalDateStr(e.date)))

    for (const rc of remote) {
      if (!localDates.has(rc.date)) {
        await db.warmupHistory.add({ date: new Date(rc.date) }).catch(() => {})
      }
    }
    const all = await db.warmupHistory.toArray()
    for (const e of all) await syncWarmupHistory(userId, e.date)
  } catch (err) { console.warn('[Vocaleap] mergeWarmupHistory例外:', err) }
}

// ── DAILY QUIZ HISTORY ────────────────────────────────────────────────────────

/** daily_quiz_history 1件をupsert */
export async function syncDailyQuizHistory(userId, date) {
  if (!userId) return
  try {
    const { error } = await supabase.from('daily_quiz_history').upsert(
      { user_id: userId, date: toLocalDateStr(date) },
      { onConflict: 'user_id,date' }
    )
    if (error) console.warn('[Vocaleap] daily_quiz_history sync失敗:', error.message)
  } catch (err) { console.warn('[Vocaleap] daily_quiz_history sync例外:', err) }
}

/** ログイン時：daily_quiz_history双方向マージ */
export async function mergeDailyQuizHistory(userId, db) {
  if (!userId) return
  try {
    const { data: remote, error } = await supabase.from('daily_quiz_history').select('*').eq('user_id', userId)
    if (error || !remote) return

    const local = await db.dailyQuizHistory.toArray()
    const localDates = new Set(local.map(e => toLocalDateStr(e.date)))

    for (const rc of remote) {
      if (!localDates.has(rc.date)) {
        await db.dailyQuizHistory.add({ date: new Date(rc.date) }).catch(() => {})
      }
    }
    const all = await db.dailyQuizHistory.toArray()
    for (const e of all) await syncDailyQuizHistory(userId, e.date)
  } catch (err) { console.warn('[Vocaleap] mergeDailyQuizHistory例外:', err) }
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

// ── CHECKED WORDS ─────────────────────────────────────────────────────────────

/** checked_word 1件をupsert（チェック追加） */
export async function syncCheckedWord(userId, leapNumber, word) {
  if (!userId) return
  try {
    const { error } = await supabase.from('checked_words').upsert({
      user_id: userId,
      leap_number: leapNumber,
      word: word ?? '',
      checked_at: new Date().toISOString(),
    }, { onConflict: 'user_id,leap_number' })
    if (error) console.warn('[Vocaleap] checked_word sync失敗:', error.message)
  } catch (err) { console.warn('[Vocaleap] checked_word sync例外:', err) }
}

/** checked_word 1件をSupabaseから削除（チェック解除） */
export async function deleteCheckedWord(userId, leapNumber) {
  if (!userId) return
  try {
    const { error } = await supabase.from('checked_words')
      .delete()
      .eq('user_id', userId)
      .eq('leap_number', leapNumber)
    if (error) console.warn('[Vocaleap] checked_word delete失敗:', error.message)
  } catch (err) { console.warn('[Vocaleap] checked_word delete例外:', err) }
}

/** クリアタイムランキング取得（cleared=true かつ total_time IS NOT NULL のベストタイム） */
export async function fetchClearTimeRankings() {
  try {
    const { data: history, error: histError } = await supabase
      .from('challenge_history')
      .select('user_id, total_time, date')
      .eq('cleared', true)
      .not('total_time', 'is', null)
    if (histError) { console.warn('[Vocaleap] fetchClearTimeRankings history失敗:', histError.message); return [] }

    const { data: userStats, error: statsError } = await supabase
      .from('user_stats')
      .select('user_id, display_name')
    if (statsError) { console.warn('[Vocaleap] fetchClearTimeRankings stats失敗:', statsError.message); return [] }

    const displayNameMap = {}
    for (const u of (userStats ?? [])) {
      displayNameMap[u.user_id] = u.display_name
    }

    // ユーザーごとにベスト（最小）タイムを保持、同タイム時は新しい日付を優先
    const bestByUser = {}
    for (const row of (history ?? [])) {
      const existing = bestByUser[row.user_id]
      if (
        !existing ||
        row.total_time < existing.total_time ||
        (row.total_time === existing.total_time && new Date(row.date) > new Date(existing.date))
      ) {
        bestByUser[row.user_id] = row
      }
    }

    return Object.values(bestByUser)
      .map(row => ({
        user_id:      row.user_id,
        display_name: displayNameMap[row.user_id] ?? null,
        total_time:   row.total_time,
        date:         row.date,
      }))
      .sort((a, b) => {
        if (a.total_time !== b.total_time) return a.total_time - b.total_time
        return new Date(b.date) - new Date(a.date)
      })
  } catch (err) {
    console.warn('[Vocaleap] fetchClearTimeRankings例外:', err)
    return []
  }
}

/** ログイン時：checked_words双方向マージ */
export async function mergeCheckedWords(userId, db) {
  if (!userId) return
  try {
    const { data: remote, error } = await supabase.from('checked_words').select('*').eq('user_id', userId)
    if (error || !remote) return

    const local = await db.checked_words.toArray()
    const localMap = new Map(local.map(r => [r.leapNumber, r]))
    const remoteLeaps = new Set(remote.map(r => r.leap_number))

    // remote → local
    for (const rc of remote) {
      if (!localMap.has(rc.leap_number)) {
        await db.checked_words.add({
          leapNumber: rc.leap_number,
          word: rc.word ?? '',
          checkedAt: rc.checked_at ? new Date(rc.checked_at) : new Date(),
        }).catch(() => {})
      }
    }

    // local → remote（サーバーにないものをupsert）
    for (const lc of local) {
      if (!remoteLeaps.has(lc.leapNumber)) {
        await syncCheckedWord(userId, lc.leapNumber, lc.word)
      }
    }
  } catch (err) { console.warn('[Vocaleap] mergeCheckedWords例外:', err) }
}
