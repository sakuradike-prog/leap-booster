import { useState, useEffect, useCallback } from 'react'
import { db } from '../db/database'

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
  // 'freeze_used' | 'freeze_earned' | 'streak_broken' | null
  const [freezeNotice, setFreezeNotice] = useState(null)

  useEffect(() => {
    db.userStats.get(1).then(s => {
      if (s) setStats({ ...DEFAULT_STATS, ...s })
      setLoading(false)
    })
  }, [])

  // アプリ起動時にストリーク状態をチェック（Home の useEffect から呼ぶ）
  const checkStreak = useCallback(async () => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    if (!current.lastStudyDate) return null

    const today = new Date()
    const last = new Date(current.lastStudyDate)

    // 今日 or 昨日なら問題なし
    if (isSameDay(last, today) || isYesterday(last)) return null

    // 1日だけ空いた + フリーズ残りあり → フリーズ消費してストリーク維持
    const daysMissed = Math.floor((today - last) / (1000 * 60 * 60 * 24))
    if (daysMissed === 1 && (current.freezeCount ?? 0) > 0) {
      // lastStudyDate を昨日に設定することで、今日勉強するとストリーク+1になる
      const yesterday = new Date(today)
      yesterday.setDate(today.getDate() - 1)
      const updated = {
        ...DEFAULT_STATS,
        ...current,
        freezeCount: (current.freezeCount ?? 0) - 1,
        lastStudyDate: yesterday,
      }
      await db.userStats.put(updated)
      setStats(updated)
      setFreezeNotice('freeze_used')
      return { freezeUsed: true }
    }

    // ストリーク途切れ
    const oldStreak = current.currentStreak ?? 0
    const updated = { ...DEFAULT_STATS, ...current, currentStreak: 0 }
    await db.userStats.put(updated)
    setStats(updated)
    if (oldStreak > 0) setFreezeNotice('streak_broken')
    return { streakBroken: true, oldStreak }
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
    if (freezeEarned) setFreezeNotice('freeze_earned')
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
    if (freezeEarned) setFreezeNotice('freeze_earned')
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
    if (freezeEarned) setFreezeNotice('freeze_earned')
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
    return updated
  }, [])

  const clearFreezeNotice = useCallback(() => setFreezeNotice(null), [])

  return {
    stats,
    loading,
    freezeNotice,
    clearFreezeNotice,
    checkStreak,
    recordStudy,
    recordChallengeClear,
    recordDailyQuiz,
    addPoints,
  }
}
