import { supabase } from '../lib/supabase'
import { db } from '../db/database'
import { syncUserStats, fetchUserStats, fromRemote } from './supabaseSync'

const MIGRATION_KEY = 'vocaleap_migrated_v1'

/**
 * 初回ログイン時にローカルデータとSupabaseを同期する
 * - Supabaseにデータがあれば → ローカルに反映（新デバイス対応）
 * - Supabaseにデータがなければ → ローカルをアップロード（初回移行）
 */
export async function migrateLocalDataToServer(userId) {
  if (!userId) return
  if (localStorage.getItem(MIGRATION_KEY) === userId) return

  try {
    const remoteStats = await fetchUserStats(userId)

    if (remoteStats) {
      // Supabaseにデータあり → ローカルと比較して新しい方を採用
      const localStats = await db.userStats.get(1)
      const remotePts = remoteStats.total_points ?? 0
      const localPts = localStats?.totalPoints ?? 0

      if (remotePts >= localPts) {
        // Supabaseを優先してローカルに反映
        const merged = fromRemote(remoteStats)
        await db.userStats.put(merged)
        console.log('[Vocaleap] Supabaseのデータをローカルに反映しました（ポイント:', remotePts, '）')
      } else {
        // ローカルが新しければSupabaseを更新
        await syncUserStats(userId, localStats)
        console.log('[Vocaleap] ローカルのデータでSupabaseを更新しました（ポイント:', localPts, '）')
      }
    } else {
      // Supabaseにデータなし → ローカルをアップロード
      const localStats = await db.userStats.get(1)
      if (localStats) {
        await syncUserStats(userId, localStats)
        console.log('[Vocaleap] ローカルデータをSupabaseにアップロードしました')
      }
    }

    // 移行完了フラグ（同じユーザーIDで二重移行を防ぐ）
    localStorage.setItem(MIGRATION_KEY, userId)
  } catch (err) {
    console.warn('[Vocaleap] データ移行エラー:', err)
  }
}
