# ストリーク/フリーズ アニメーション試作とロールバック記録

## 背景
- 2026-03-24: CEO指示でストリーク、フリーズ周りのアニメーションを試作（v1.5.14開発中）
- 現行デプロイ:v1.5.12以降の変更をすべて元に戻す要求あり

## 試作内容
1. `useStreakAnimation` フック実装
   - `triggerFreezeAnimation` (氷演出 + 振動 + サウンド)
   - `triggerCountdownAnimation` (0までカウントダウン)
   - `triggerRollUpAnimation` (ストリーク更新時の横揺れ + 上下スライド)
   - `displayStreak` および `animationType` 管理

2. CSSアニメーション
   - `streak-shake` `streak-freezing` `streak-breaking` `streak-countdown` `streak-rolling-out/in` 

3. Home.jsx変更
   - `onRestore` で `triggerFreezeAnimation`、`onDismiss` で `triggerCountdownAnimation`
   - `useEffect`で `stats.currentStreak` 変化監視しロールアップを1日1回実行
   - `useLocation` + `reloadStats` による Settings から戻る時の更新

4. Settings.jsx開発者ボタン追加
   - `handleTestSetFreeze2`, `handleTestSetStreak10`, `handleTestCreateBreakState`, `handleTestResetTodayStudy`, `handleTestResetAll`

## ロールバック結果
- `git checkout -- src/hooks/useUserStats.js src/pages/Home.jsx src/pages/Settings.jsx`
- 未追跡ファイル削除 (存在しない場合でも問題なし)
  - `src/hooks/useStreakAnimation.js`
  - `src/components/StreakBreakModal.jsx` (テストで追加されていた場合)
  - `src/styles/streak-animation.css`
- `git status` -> clean

## 今後の進め方
- このファイルを参照して、再度同機能を検討する際の土台とする
- v1.5.12 の安定動作を優先し、UI/UX効果が明確であれば改めて投入する
