# Vocaleap サーバー側ログイン・データ保存機能追加 ロードマップ

作成日: 2026-03-21
担当: 開発部門「ハル」
対象バージョン: v1.4.26

---

## 現状把握サマリー

### 技術スタック（確認済み）
- React 19 + Vite 7 + Tailwind v4 + react-router-dom v7
- Dexie v4 (IndexedDB ラッパー)
- vite-plugin-pwa (PWA対応)
- @google/generative-ai（devDeps → Gemini API利用あり）
- Vercel ホスティング

### DBスキーマ（database.js 確認済み）
| テーブル | 主な用途 |
|---|---|
| words | LEAP単語マスタ |
| cards | SRS復習カード（lastReviewed, studyCount） |
| wordFamilies | 語族マスタ |
| roots | 語源マスタ |
| warmupSentences | 瞬間英作文センテンス |
| captured_words | ユーザー登録の野生単語 |
| userStats | ストリーク・ポイント・統計（id=1固定）|
| challengeHistory | チャレンジ履歴 |
| warmupHistory | 瞬間英作文履歴 |
| study_logs | 学習イベントログ（eventType, mode, hour） |
| session_logs | セッションログ（date, mode, startTime） |

### useUserStats.js の設計上の注意点
- `userStats` レコードは `id: 1` の1件固定（シングルユーザー前提）
- `checkStreak`, `recordStudy`, `recordChallengeClear`, `recordDailyQuiz`, `addPoints` など多数の書き込み関数が存在
- これらすべてが IndexedDB に直接書き込む設計 → サーバー同期追加時に変更が必要

---

## 技術選定の検討

### 認証の選択肢

| 選択肢 | 無料枠 | 導入コスト | Vercel相性 | 備考 |
|---|---|---|---|---|
| Firebase Authentication | MAU 10,000まで無料 | 低 | ○ | Googleアカウントログイン一発 |
| Supabase Auth | MAU 50,000まで無料 | 低〜中 | ◎ | DBと一体化できる |
| NextAuth.js / Auth.js | 無制限（OSS） | 高 | △ | Next.js前提の設計、Reactのみには向かない |
| Clerk | MAU 10,000まで無料 | 低 | ◎ | UIコンポーネント付き、管理画面が充実 |

### データベースの選択肢

| 選択肢 | 無料枠 | 導入コスト | 備考 |
|---|---|---|---|
| Supabase (PostgreSQL) | 500MB、プロジェクト2つまで | 低〜中 | Auth + DB + REST APIが一体 |
| Firebase Firestore | 1GB、50,000読み/日 | 低 | NoSQL、スキーマ自由度高い |
| Neon (PostgreSQL) | 0.5GB、無料ブランチあり | 中 | Serverless PostgreSQL、Vercel統合あり |
| Convex | 1GB、2M req/月 | 中〜高 | リアルタイム同期が強力だが学習コスト高 |

---

## 推奨構成

### Supabase（Auth + PostgreSQL）一択を推奨

**理由:**

1. **認証とDBが完全一体化** — Supabase Auth のユーザーIDがそのままDBの外部キーになる。別サービスを組み合わせる複雑さがない。

2. **無料枠が十分** — MAU 50,000、500MB ストレージ。個人アプリの規模で無料枠超えはほぼない。非アクティブプロジェクトは7日で一時停止されるが、月1回アクセスがあれば維持される（有料プランは月25ドル）。

3. **Row Level Security (RLS)** — `user_id = auth.uid()` の1行ポリシーで「自分のデータしか読めない」を実現できる。バックエンドAPIを書かずにセキュリティが確保できる。

4. **既存のDexie設計との相性** — PostgreSQLはテーブル設計が現在のIndexedDBスキーマと1:1で対応できる。NoSQL（Firestore）より移行しやすい。

5. **Vercel との統合** — Supabase の環境変数を Vercel に設定するだけで動く。デプロイフローに変更不要。

6. **クライアントSDKがシンプル** — `@supabase/supabase-js` をインストールすれば、`supabase.from('table').select()` で動く。バックエンドサーバー不要。

---

## フェーズ別ロードマップ

### Phase 1: 認証の追加（ログイン機能）
**目標:** ユーザーがGoogleアカウントでログインできる状態にする
**期間見積もり（Claude Codeで開発）:** 3〜5時間

#### 作業内容

1. **Supabaseプロジェクト作成**
   - supabase.com でプロジェクト作成（無料）
   - Google OAuth プロバイダーを有効化
   - `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を取得

2. **パッケージ追加**
   ```
   npm install @supabase/supabase-js
   ```

3. **Supabaseクライアント作成**
   - `src/lib/supabase.js` を新規作成

4. **AuthContext の作成**
   - `src/contexts/AuthContext.jsx` を新規作成
   - `useAuth()` フックでログイン状態を全体に提供

5. **ログイン画面の作成**
   - `src/pages/Login.jsx` を新規作成
   - 「Googleでログイン」ボタンのみのシンプルな画面

6. **ルーティングの保護**
   - `App.jsx` に未ログイン時のリダイレクト処理を追加

#### この段階での状態
- ログイン/ログアウトが動く
- 学習データはまだIndexedDBのまま（変更なし）
- アプリの動作に影響なし

---

### Phase 2: サーバーへのデータ同期（IndexedDBとの共存）
**目標:** 学習データをSupabaseに保存し、複数デバイスで共有できるようにする
**期間見積もり（Claude Codeで開発）:** 10〜15時間

#### 2-1. Supabaseにテーブルを作成

現在のIndexedDBスキーマをそのままPostgreSQLに移植する。

```sql
-- userStats（1ユーザー1行）
create table user_stats (
  user_id uuid references auth.users primary key,
  total_points int default 0,
  current_streak int default 0,
  longest_streak int default 0,
  last_study_date date,
  challenge_clear_count int default 0,
  challenge_last_date date,
  daily_quiz_last_date date,
  freeze_count int default 0,
  today_points int default 0,
  today_points_date date,
  updated_at timestamptz default now()
);

-- study_logs（追記のみ）
create table study_logs (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  leap_number int,
  event_type text,
  mode text,
  timestamp timestamptz,
  hour int
);

-- session_logs（追記のみ）
create table session_logs (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  date date,
  mode text,
  start_time timestamptz
);

-- captured_words（ユーザー固有データ）
create table captured_words (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  leap_number int,
  word text,
  captured_at timestamptz
);

-- cards（SRSデータ）
create table cards (
  id bigserial primary key,
  user_id uuid references auth.users not null,
  word_id int,
  last_reviewed timestamptz,
  study_count int default 0
);

-- RLSポリシー（全テーブル共通）
alter table user_stats enable row level security;
create policy "users can only access own data"
  on user_stats for all
  using (auth.uid() = user_id);
-- (他テーブルも同様)
```

#### 2-2. 同期戦略: オフラインファースト + バックグラウンド同期

**設計方針:**
- IndexedDB を「キャッシュ層」として維持（オフライン対応のため）
- Supabase を「正規データ層」として扱う
- 書き込み時: IndexedDB に書いた後、非同期でSupabaseにも書く（失敗しても学習は止まらない）
- 起動時: ログイン済みならSupabaseから最新データをフェッチしてIndexedDBに反映

```
[ユーザー操作]
    ↓
[IndexedDB に書き込み] ← 即座に成功（オフラインでも動く）
    ↓（非同期・失敗しても学習継続）
[Supabase に書き込み]
    ↓（失敗したログはキューに積む）
[再接続時にキューを処理]
```

#### 2-3. useUserStats.js の変更方針

`useUserStats.js` の各関数の末尾に Supabase への同期処理を追加する。

変更が必要な関数:
- `recordStudy()` → `user_stats` テーブルを upsert
- `recordChallengeClear()` → `user_stats` と `challenge_history` に書き込み
- `recordDailyQuiz()` → `user_stats` と `session_logs` に書き込み
- `addPoints()` → `user_stats` を upsert

**実装の優先順位:**
1. `user_stats`（最重要 — ストリーク・ポイント）
2. `study_logs`（分析用）
3. `session_logs`（セッション記録）
4. `captured_words`（ユーザー独自データ）
5. `cards`（SRSデータ、最も量が多い）

#### 2-4. 新規デバイスでのデータ読み込み

```
[新デバイスでログイン]
    ↓
[Supabaseからuser_statsをフェッチ]
    ↓
[IndexedDBのuser_statsに書き込み（id:1固定で put）]
    ↓
[アプリ通常起動]
```

---

### Phase 3: 完全移行 or ハイブリッド運用の判断

Phase 2 完了後に判断する。現時点での予測:

**推奨: ハイブリッド運用を継続**

| 観点 | ハイブリッド | 完全Supabase移行 |
|---|---|---|
| オフライン対応 | 維持できる | 失われる（重大な欠点） |
| 開発コスト | Phase2で完結 | さらに+10〜20時間 |
| パフォーマンス | IndexedDBが高速 | ネットワーク依存 |
| PWAとしての価値 | 高い | 低下する |

PWAの核心はオフラインファーストであるため、IndexedDBを完全に捨てる理由はない。
Supabaseは「バックアップ + 複数デバイス同期 + データ可視化」の役割に留めるのが現実的。

---

## 既存データの移行計画

### 設計原則: データを絶対に失わせない

ユーザーが今まで積み上げたストリーク・ポイント・SRSデータは学習の「資産」であり、移行失敗で消えることは絶対に避ける。

### 移行フロー

```
[初回ログイン時]
    ↓
[Supabaseに既存データがあるか確認]
  ├── ある → Supabaseのデータを優先（新しいデバイスからの登録）
  └── ない → IndexedDBのデータをSupabaseにアップロード（移行）
```

### 具体的な実装

`src/utils/migratToServer.js` を新規作成:

1. `db.userStats.get(1)` でローカルデータを取得
2. Supabase の `user_stats` テーブルに `user_id` で照会
3. Supabaseにデータがなければ、ローカルデータを `insert`
4. 移行完了フラグを IndexedDB の別テーブルに記録（二重移行防止）

### study_logs / session_logs の移行

これらは追記専用ログであり、量が多い可能性がある。
- 移行対象: 直近180日分のみ（それ以前は学習に不要）
- バックグラウンドで分割アップロード（1回50件ずつ）

### cards（SRSデータ）の移行

最も重要度が高い（SRSの復習スケジュールが消えると最悪）。
- 全件を移行する
- `word_id` + `user_id` でユニーク制約を設け、重複を防ぐ

---

## 工数・難易度の見積もり

Claude Code での開発を前提とした見積もり。

| フェーズ | 工数 | 難易度 | 説明 |
|---|---|---|---|
| Phase 1: 認証追加 | 3〜5時間 | ★★☆☆☆ | Supabase設定 + AuthContext + Loginページ |
| Phase 2-1: テーブル設計 | 1〜2時間 | ★★☆☆☆ | SQL実行のみ（Supabaseダッシュボード） |
| Phase 2-2: user_stats同期 | 3〜5時間 | ★★★☆☆ | useUserStats.js の改修 |
| Phase 2-3: ログ系同期 | 3〜5時間 | ★★☆☆☆ | 追記のみなので比較的シンプル |
| Phase 2-4: cards同期 | 5〜8時間 | ★★★★☆ | 量が多く、競合解決が必要 |
| 既存データ移行ツール | 2〜3時間 | ★★★☆☆ | 初回ログイン時の移行ロジック |
| **合計** | **17〜28時間** | | |

### 優先度付き実装順序（現実的なアプローチ）

週数時間の作業時間を前提にすると:

```
Week 1-2: Phase 1（認証）→ まずログインできる状態にする
Week 3-4: user_stats の同期 → ストリーク・ポイントを守る
Week 5-6: ログ系の同期 → 学習履歴を保存
Week 7-8: cards の同期 → SRSデータを複数デバイスで共有
Week 9:   既存データ移行ツール → 現ユーザーのデータを救済
```

---

## 注意点・リスク

### 1. 無料枠での運用可否

**Supabase 無料枠の制限:**
- ストレージ: 500MB（単語データ + ログで数十MB想定 → 余裕あり）
- MAU: 50,000（個人アプリで超える可能性はゼロに近い）
- DBサイズ: 500MB
- 帯域: 5GB/月
- **最大の注意点: 7日間非アクティブでプロジェクトが一時停止される**
  - 対策: 月1回以上アクセスがあれば問題ない（個人使用なら問題なし）
  - 将来的にユーザーが増えたら月25ドルのProプランへ移行

### 2. データプライバシー

- Supabase はデフォルトでデータが米国サーバーに保存される（AWS us-east-1）
- 個人の学習ログが対象 → 機密性は低いが、プライバシーポリシーの明示が必要
- RLS（Row Level Security）を必ず有効化すること → 他ユーザーのデータ参照を防ぐ
- 認証にGoogleを使うため、メールアドレスがSupabaseに保存される点をユーザーに開示する

### 3. オフライン対応の維持

- IndexedDB を削除しないことが最重要
- Supabase への書き込みは必ず「非同期・失敗しても学習継続」の設計にする
- `navigator.onLine` でオンライン状態を確認し、オフライン時はキューに積む
- Service Worker（vite-plugin-pwa）との競合に注意 → Supabaseのfetchがキャッシュされないよう設定が必要

### 4. useUserStats.js の変更リスク

- 現在の `id: 1` 固定設計はシングルユーザー前提
- サーバー対応後も `id: 1` をローカル識別子として維持しつつ、`user_id` をサーバー用に追加する設計にすれば最小限の変更で済む
- 変更箇所が多いため、テストを手動で十分に行うこと（ストリーク計算のバグは致命的）

### 5. Gemini API との兼ね合い

- `@google/generative-ai` が devDependencies に含まれている
- 本番ビルドに含まれている場合、APIキーの管理に注意
- Supabase Edge Functions（サーバーレス関数）に Gemini 呼び出しを移すことで、APIキーをクライアントから隠す改善も将来的に検討できる

---

## 総評

現在の Vocaleap は「オフラインファーストの個人学習アプリ」として完成度が高い。サーバー機能の追加は、主に「複数デバイスでの継続利用」と「データのバックアップ」を目的とする。

最大のリスクはオフライン対応の劣化とデータ移行失敗であり、両方とも「IndexedDBを捨てない + 移行は慎重に」という方針で回避できる。

**推奨アクション（次の一手）:**
1. Supabase プロジェクトを作成し、Google OAuth を有効化する
2. `src/lib/supabase.js` と `src/contexts/AuthContext.jsx` を作成する
3. ログイン画面を追加し、残りの機能を変更せずに動作確認する

この3ステップが完了すれば、最大のリスク（既存機能の破壊）を避けながら土台が完成する。
