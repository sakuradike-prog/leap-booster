# Vocaleap 開発引継ぎ（Claude Code セッション用）

> **作成**: 2026-03-26夜 / ミズキ（秘書）
> **目的**: 出先（iPad Pro SSH接続）からの新セッションで即座に開発再開するための資料

---

## ⚡ まず確認すること

```bash
# 現在のバージョン確認
cat package.json | grep version
# → "version": "1.5.50"

# ビルドが通るか確認
npm run build 2>&1 | tail -3
```

---

## 🚀 デプロイ手順（毎回これ）

```bash
# 1. バージョンを上げる（package.json の "version" を 1.5.50 → 1.5.51 に）
# 2. ビルド
npm run build
# 3. デプロイ
npx vercel --prod
# "Aliased: https://leap-booster.vercel.app" が出れば完了
```

**本番URL**: https://leap-booster.vercel.app
**Supabase**: https://duyewgyrijafblwcrgdd.supabase.co

---

## 📋 残りTODO（4月8日リリース目標・残り約12日）

### 🔴 優先度：高（すぐ着手）

#### 1. `recorded_at` のコード実装（Supabase SQLカラムは追加済み）
- **対象ファイル**: `src/pages/Challenge.jsx`、`src/utils/supabaseSync.js`
- **やること**: チャレンジ完了時に `recorded_at: new Date().toISOString()` を保存・同期する
- **現状**: `challenge_history` テーブルに `recorded_at timestamptz` カラムは追加済み
- **目的**: チャレンジ履歴に正確な日時を表示する（現在は00:00になっている）

#### 2. 仕分け練習の実装
- **場所**: `src/pages/DailyQuiz.jsx`（モード選択画面から遷移）
- **仕様**:
  - 15単語を画面に表示
  - 1単語ずつ「わかる👍 / わからない👎」に仕分け
  - 「わからない」に仕分けた単語の解説画面へ遷移
- **現状**: モード選択画面に「近日公開」グレー表示で存在している

#### 3. スペル入力練習の実装
- **場所**: `src/pages/DailyQuiz.jsx`（モード選択画面から遷移）
- **仕様**:
  - 日本語の意味を表示
  - 英単語をキーボードでタイプ入力
  - 正誤判定（完全一致 or 揺れ許容）
- **現状**: モード選択画面に「近日公開」グレー表示で存在している

### 🟡 優先度：中

#### 4. 先生ダッシュボード強化
- **対象ファイル**: `src/pages/TeacherDashboard.jsx`
- **仕様**: 未確定。先生（社長）との設計会話が必要

### 🟢 優先度：低（4月8日以降）

- Freeze プレゼント機能（サーバー実装が必要）
- FSRSアルゴリズム（フェーズ2）
- AI長文生成（Gemini API、フェーズ2）

---

## 📁 主要ファイル一覧

```
src/
├── pages/
│   ├── Home.jsx            # ホーム（Freezeモーダル含む）
│   ├── Challenge.jsx       # 30問チャレンジ（1日1回・開始時消費）
│   ├── DailyQuiz.jsx       # Daily Quiz（モード選択→4択/仕分け/スペル）
│   ├── Rankings.jsx        # ランキング（ポイント/ストリーク/チャレンジ/タイム/捕獲/今週/連続）
│   ├── Stats.jsx           # 学習記録（Supabase直読み・デバイス間同期）
│   ├── StudyHistory.jsx    # 単語学習履歴（捕獲・チェックバッジ付き）
│   ├── StreakInfoPage.jsx   # ストリーク詳細（直近7日間学習履歴）
│   ├── TeacherDashboard.jsx # 先生専用ダッシュボード
│   └── Settings.jsx        # 設定（ニックネーム・音声・ログアウト）
├── hooks/
│   ├── useUserStats.js     # ストリーク・ポイント・Freeze管理
│   └── useAuth.js          # Supabase認証
├── utils/
│   ├── supabaseSync.js     # Supabase同期ユーティリティ
│   └── consecutiveCorrect.js # 連続正解管理
├── components/
│   └── WordDetailScreen.jsx # 単語解説画面（チェック機能・vocaleap:checked発火）
└── db/database.js          # Dexie（IndexedDB）スキーマ v9
```

---

## 🗄️ Supabaseテーブル（実行済みSQL一覧）

| テーブル | 追加カラム | 状態 |
|---|---|---|
| `user_stats` | `consecutive_correct`, `week_points`, `week_start_date` | ✅ SQL済み・コード済み |
| `challenge_history` | `total_time integer`, `recorded_at timestamptz` | ✅ SQL済み / ⚠️ recorded_atのコードは未実装 |
| `checked_words` | 新テーブル（leapNumber, word, checkedAt, user_id） | ✅ SQL済み・コード済み |

---

## 🔧 最近実装した内容（v1.5.36→v1.5.50）

| バージョン | 内容 |
|---|---|
| v1.5.37 | チャレンジタイム記録・Stats画面整理 |
| v1.5.38〜40 | 4択「チェック済み単語」修正・画面クラッシュ修正・同期問題修正 |
| v1.5.41〜42 | チャレンジparts同期・Stats/StudyHistoryをSupabase直読みに変更 |
| v1.5.43〜45 | recorded_at SQL追加・ランキング3タブ・Daily Quizモード選択 |
| v1.5.46〜48 | αヒートマップ修正・捕獲バッジ・チェックバッジ・タイトル説明 |
| v1.5.49 | チャレンジ1日1回バグ修正・チェックマーク即時反映 |
| v1.5.50 | Freezeバーをタップ可能に・詳細モーダル（カウントダウン・プレゼント説明） |

---

## ⚠️ 注意事項

1. **ビルド前に必ずバージョンを上げる**（package.json の `version` フィールド）
2. **Supabase SQLを実行する場合は先生（社長）に依頼**（自分では実行できない）
3. **認証エラー頻発の既知問題**：PCブラウザで認証失敗が出やすい。軽減策は検討中
4. **テストは本番URLで確認**：localhost でも確認可能だが、Supabase連携は本番での確認が確実

---

## 👥 チーム構成（My Note Company）

| 役職 | 名前 | 担当 |
|---|---|---|
| 社長 | さとし | 意思決定・執筆（私立高校英語教師） |
| CEO | ケンジ | 全体戦略・社長への報告 |
| 秘書 | ミズキ | タスク整理・記録・進捗管理 |
| PM | サクラ | スケジュール管理・リマインダー |
| 開発 | ハル | コード実装担当（このファイルを読んでいる） |
| リサーチ | ソウ | 市場調査 |
| マーケ | レナ | コンテンツ戦略 |
