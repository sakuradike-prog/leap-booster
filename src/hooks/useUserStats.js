import { useState, useEffect, useCallback } from 'react'
import { db } from '../db/database'

const DEFAULT_STATS = {
  id: 1,
  totalPoints: 0,
  currentStreak: 0,
  lastStudyDate: null,
  challengeClearCount: 0,
  dailyQuizLastDate: null,
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

export function useUserStats() {
  const [stats, setStats] = useState(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.userStats.get(1).then(s => {
      if (s) setStats(s)
      setLoading(false)
    })
  }, [])

  // 学習日を記録してストリークを更新する
  const recordStudy = useCallback(async () => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    const today = new Date()
    const last = current.lastStudyDate ? new Date(current.lastStudyDate) : null

    let newStreak = current.currentStreak
    if (!last) {
      newStreak = 1
    } else if (isSameDay(last, today)) {
      // 今日すでに記録済み → ストリーク変更なし
    } else if (isYesterday(last)) {
      newStreak = current.currentStreak + 1
    } else {
      // 2日以上空いた
      newStreak = 1
    }

    const updated = { ...current, currentStreak: newStreak, lastStudyDate: today }
    await db.userStats.put(updated)
    setStats(updated)
    return updated
  }, [])

  // チャレンジクリア時に呼ぶ（ポイント加算 + 学習記録）
  const recordChallengeClear = useCallback(async () => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    const today = new Date()
    const last = current.lastStudyDate ? new Date(current.lastStudyDate) : null

    let newStreak = current.currentStreak
    if (!last) {
      newStreak = 1
    } else if (isSameDay(last, today)) {
      // no change
    } else if (isYesterday(last)) {
      newStreak = current.currentStreak + 1
    } else {
      newStreak = 1
    }

    const updated = {
      ...current,
      totalPoints: current.totalPoints + 1,
      currentStreak: newStreak,
      lastStudyDate: today,
      challengeClearCount: current.challengeClearCount + 1,
    }
    await db.userStats.put(updated)
    setStats(updated)
    return updated
  }, [])

  // デイリークイズ完了時に呼ぶ（ポイント加算 + 学習記録 + 最終受験日更新）
  const recordDailyQuiz = useCallback(async (points) => {
    const current = (await db.userStats.get(1)) ?? DEFAULT_STATS
    const today = new Date()
    const last = current.lastStudyDate ? new Date(current.lastStudyDate) : null

    let newStreak = current.currentStreak
    if (!last) {
      newStreak = 1
    } else if (isSameDay(last, today)) {
      // no change
    } else if (isYesterday(last)) {
      newStreak = current.currentStreak + 1
    } else {
      newStreak = 1
    }

    const updated = {
      ...current,
      totalPoints: current.totalPoints + points,
      currentStreak: newStreak,
      lastStudyDate: today,
      dailyQuizLastDate: today,
    }
    await db.userStats.put(updated)
    setStats(updated)
    return updated
  }, [])

  return { stats, loading, recordStudy, recordChallengeClear, recordDailyQuiz }
}
