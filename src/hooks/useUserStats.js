import { useState, useEffect, useCallback } from 'react'
import { db } from '../db/database'
import { supabase } from '../lib/supabase'
import { syncUserStats, fetchUserStats, fromRemote } from '../utils/supabaseSync'

/** Supabaseのユーザーを取得（非同期、失敗時はnull） */
async function getCurrentUserId() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.id ?? null
  } catch {
    return null
  }
}

const DEFAULT_STATS = {
  id: 1,
  totalPoints: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastStudyDate: null,
  challengeClearCount: 0,
  challengeLastDate: null,
  dailyQuizLastDate: null,
  freezeCount: 0,
  todayPoints: 0,
  todayPointsDate: null,
}

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isYesterday(date) {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  return isSameDay(date, yesterday)
}

// ストリーク計算（today は Date オブジェクト）
function calcNewStreak(current, today) {
  const last = current.lastStudyDate ? new Date(current.lastStudyDate) : null
  if (!last) return 1
  if (isSameDay(last, today)) return current.currentStreak ?? 0 // 今日すでに記録済み
  if (isYesterday(last)) return (current.currentStreak ?? 0) + 1
  return 1 // 2日以上空いた
}

// 7の倍数でフリーズ1個付与（最大2個）
function calcNewFreeze(current, newStreak) {
  const prevStreak = current.currentStreak ?? 0
  const freezeCount = current.freezeCount ?? 0
  if (newStreak > prevStreak && newStreak % 7 === 0 && freezeCount < 2) {
    return { newFreezeCount: Math.min(freezeCount + 1, 2), freezeEarned: true }
  }
  return { newFreezeCount: freezeCount, freezeEarned: false }
}

export function useUserStats() {
  const [stats, setStats] = useState(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)
  // { type: 'freeze_used'|'freeze_earned'|'streak_broken'|'can_use_freeze', oldStreak?, freezeCount? } | null
  const [freezeNotice, setFreezeNotice] = useState(null)

  useEffect(() => {
    async function loadStats() {
      const localData = await db.userStats.get(1)
      if (localData) setStats({ ...DEFAULT_STATS, ...localData })

      // ログイン済みならSupabaseを正とする（サーバーデータを常に優先）
      const userId = await getCurrentUserId()
      if (userId) {
        const remote = await fetchUserStats(userId)
        if (remote) {
          const merged = fromRemote(remote)
          await db.userStats.put(merged)
          setStats({ ...DEFAULT_STATS, ...merged })
        }
      }
      setLoading(false)
    }
    loadStats()
  }, [])

  // アプリ起動時にストリーク状態をチェック（Home の useEffect から呼ぶ）
  const checkStreak = useCallback(async () => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    if (!current.lastStudyDate) return null

    const today = new Date()
    const last = new Date(current.lastStudyDate)

    // 今日 or 昨日なら問題なし
    if (isSameDay(last, today) || isYesterday(last)) return null

    // カレンダー日付差（ローカル日付基準）で計算
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const lastDate  = new Date(last.getFullYear(),  last.getMonth(),  last.getDate())
    const dayDiff = Math.round((todayDate - lastDate) / (1000 * 60 * 60 * 24))

    // dayDiff === 2：ちょうど1日飛んだ → フリーズがあればユーザーに確認
    const oldStreak = current.currentStreak ?? 0
    if (dayDiff === 2 && (current.freezeCount ?? 0) > 0) {
      setFreezeNotice({ type: 'can_use_freeze', oldStreak, freezeCount: current.freezeCount })
      return { canUseFreeze: true, oldStreak }
    }

    // ストリーク途切れ（フリーズなし or 2日以上空いた）
    const updated = { ...DEFAULT_STATS, ...current, currentStreak: 0 }
    await db.userStats.put(updated)
    setStats(updated)
    if (oldStreak > 0) setFreezeNotice({ type: 'streak_broken', oldStreak })
    // Supabase同期（fire-and-forget）
    getCurrentUserId().then(uid => { if (uid) syncUserStats(uid, updated) })
    return { streakBroken: true, oldStreak }
  }, [])

  // フリーズを使ってストリーク維持（モーダルで「使う」を選んだとき）
  const applyFreeze = useCallback(async () => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const updated = {
      ...DEFAULT_STATS,
      ...current,
      freezeCount: Math.max(0, (current.freezeCount ?? 0) - 1),
      lastStudyDate: yesterday,
    }
    await db.userStats.put(updated)
    setStats(updated)
    setFreezeNotice({ type: 'freeze_used' })
    getCurrentUserId().then(uid => { if (uid) syncUserStats(uid, updated) })
  }, [])

  // フリーズを使わずストリークリセット（モーダルで「使わない」を選んだとき）
  const declineFreeze = useCallback(async () => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    const oldStreak = current.currentStreak ?? 0
    const updated = { ...DEFAULT_STATS, ...current, currentStreak: 0 }
    await db.userStats.put(updated)
    setStats(updated)
    setFreezeNotice({ type: 'streak_broken', oldStreak })
    getCurrentUserId().then(uid => { if (uid) syncUserStats(uid, updated) })
  }, [])

  // 学習日を記録してストリークを更新する
  const recordStudy = useCallback(async () => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    const today = new Date()
    const wasAlreadyToday = current.lastStudyDate && isSameDay(new Date(current.lastStudyDate), today)
    const newStreak = calcNewStreak(current, today)
    const { newFreezeCount, freezeEarned } = calcNewFreeze(current, newStreak)
    const newLongest = Math.max(current.longestStreak ?? 0, newStreak)

    const updated = {
      ...DEFAULT_STATS,
      ...current,
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastStudyDate: today,
      freezeCount: newFreezeCount,
    }
    await db.userStats.put(updated)
    setStats(updated)
    if (freezeEarned) setFreezeNotice({ type: 'freeze_earned' })
    // Supabase同期（fire-and-forget）
    getCurrentUserId().then(uid => { if (uid) syncUserStats(uid, updated) })
    return { ...updated, freezeEarned, streakUpdated: !wasAlreadyToday }
  }, [])

  // チャレンジクリア時（ポイント加算 + 学習記録）
  const recordChallengeClear = useCallback(async (points = 1) => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    const today = new Date()
    const wasAlreadyToday = current.lastStudyDate && isSameDay(new Date(current.lastStudyDate), today)
    const newStreak = calcNewStreak(current, today)
    const { newFreezeCount, freezeEarned } = calcNewFreeze(current, newStreak)
    const newLongest = Math.max(current.longestStreak ?? 0, newStreak)

    // 本日分ポイント集計
    const todayPts = (current.todayPointsDate && isSameDay(new Date(current.todayPointsDate), today))
      ? (current.todayPoints ?? 0) + points
      : points

    const updated = {
      ...DEFAULT_STATS,
      ...current,
      totalPoints: (current.totalPoints ?? 0) + points,
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastStudyDate: today,
      challengeClearCount: (current.challengeClearCount ?? 0) + 1,
      challengeLastDate: today,
      freezeCount: newFreezeCount,
      todayPoints: todayPts,
      todayPointsDate: today,
    }
    await db.userStats.put(updated)
    setStats(updated)
    if (freezeEarned) setFreezeNotice({ type: 'freeze_earned' })
    // Supabase同期（fire-and-forget）
    getCurrentUserId().then(uid => { if (uid) syncUserStats(uid, updated) })
    return { ...updated, freezeEarned, streakUpdated: !wasAlreadyToday }
  }, [])

  // デイリークイズ完了時（ポイント加算 + 学習記録）
  const recordDailyQuiz = useCallback(async (points) => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    const today = new Date()
    const wasAlreadyToday = current.lastStudyDate && isSameDay(new Date(current.lastStudyDate), today)
    const newStreak = calcNewStreak(current, today)
    const { newFreezeCount, freezeEarned } = calcNewFreeze(current, newStreak)
    const newLongest = Math.max(current.longestStreak ?? 0, newStreak)

    const updated = {
      ...DEFAULT_STATS,
      ...current,
      totalPoints: (current.totalPoints ?? 0) + points,
      currentStreak: newStreak,
      longestStreak: newLongest,
      lastStudyDate: today,
      dailyQuizLastDate: today,
      freezeCount: newFreezeCount,
    }
    await db.userStats.put(updated)
    setStats(updated)
    if (freezeEarned) setFreezeNotice({ type: 'freeze_earned' })
    // Supabase同期（fire-and-forget）
    getCurrentUserId().then(uid => { if (uid) syncUserStats(uid, updated) })
    return { ...updated, freezeEarned, streakUpdated: !wasAlreadyToday }
  }, [])

  // ポイントのみ加算（clearchallengeカウント・ストリーク変更なし）
  const addPoints = useCallback(async (pts) => {
    if (!pts || pts <= 0) return
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    const today = new Date()
    const todayPts = (current.todayPointsDate && isSameDay(new Date(current.todayPointsDate), today))
      ? (current.todayPoints ?? 0) + pts
      : pts
    const updated = {
      ...DEFAULT_STATS,
      ...current,
      totalPoints: (current.totalPoints ?? 0) + pts,
      todayPoints: todayPts,
      todayPointsDate: today,
    }
    await db.userStats.put(updated)
    setStats(updated)
    // Supabase同期（fire-and-forget）
    getCurrentUserId().then(uid => { if (uid) syncUserStats(uid, updated) })
    return updated
  }, [])

  const clearFreezeNotice = useCallback(() => setFreezeNotice(null), [])

  return {
    stats,
    loading,
    freezeNotice,
    clearFreezeNotice,
    checkStreak,
    applyFreeze,
    declineFreeze,
    recordStudy,
    recordChallengeClear,
    recordDailyQuiz,
    addPoints,
  }
}
