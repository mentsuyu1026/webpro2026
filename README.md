# サブスク番人 (Webpro 2026)

払い続けているサブスクリプションをまとめて管理するアプリ。
設計壁打ち.txt の「サブスク番人」設計をもとに実装した。

## 構成（三層）

- フロントエンド：EJS（サーバーサイドレンダリング）+ CSS
- バックエンド：Node.js + Express + Prisma
- データベース：PostgreSQL（Render Postgres）

コードは設計 Step 5 の役割分担に沿って分けてある。

```
index.ts                         入口（Express・セッション・ルーター取り付け）
src/
  prisma.ts                      Prisma クライアント＋ユーザー取得
  auth.ts                        Google ログイン（認証・セッション）
  routes/subscriptions.ts        ルーター＋コントローラー（URL の振り分け・入力チェック）
  services/subscriptionService.ts サービス層（一覧・合計・更新日チェック）
  services/gmailService.ts       Gmail 連携（機能 C）
views/
  login.ejs                      ログイン画面
  index.ejs                      ダッシュボード（一覧・合計・更新通知・登録）
  edit.ejs                       編集画面
public/style.css                 スタイル
prisma/schema.prisma             データ設計（User 1 - n Subscription）
```

## データ設計

- **User**: id, email, name, googleRefreshToken
- **Subscription**: id, userId(FK), name, price, billingDate, isActive
- User 1 : n Subscription

## 機能

- A. 手動登録（サービス名・金額・次の支払日）
- B. 一覧表示と継続中の月額合計
- C. Gmail から自動取り込み（ログイン中ユーザー自身の Gmail を読み取り、領収書メールからサブスクを抽出）
- D. 更新通知（支払日が 7 日以内 / 過ぎているサブスクをダッシュボード上部に表示）
- サブスクの編集・停止/再開・削除
- **Google ログイン**：各ユーザーが自分の Google アカウントでログインし、自分のデータだけを扱う（セッション管理）

## セットアップと起動

スキーマを変更したので、**初回は必ずマイグレーションと Client 生成を行うこと。**

```bash
# 1. 依存関係（未インストールなら）
npm install
npm install express-session googleapis

# 2. DB にテーブルを作成し、Prisma Client を生成
npx prisma migrate dev --name add_google_auth
npx prisma generate

# 3. 起動
npm start
```

ブラウザで http://localhost:8888/ を開く（未ログインなら /login にリダイレクトされる）。

`.env` の `DATABASE_URL` は Render Postgres の External URL を設定済み。

## Google ログイン / Gmail 連携の設定

ログインと Gmail 連携は同じ Google OAuth を使う。

1. Google Cloud Console で Gmail API を有効化し、OAuth クライアント（ウェブアプリケーション）を作成
2. OAuth 同意画面のスコープに `gmail.readonly` を追加し、テストユーザーに自分の Gmail を追加
3. OAuth クライアントの「承認済みリダイレクト URI」に次を追加
   - `http://localhost:8888/auth/google/callback`（ローカル用）
   - `https://<あなたのアプリ>.onrender.com/auth/google/callback`（本番用）
4. `.env` に以下を設定

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:8888/auth/google/callback
SESSION_SECRET=適当な長いランダム文字列
```

ログイン時に Gmail 読み取りに同意すると、そのユーザーのリフレッシュトークンが DB に保存され、
「Gmail と同期する」でそのユーザー自身のメールから取り込みができる。
（`.env` の `GOOGLE_REFRESH_TOKEN` は不要。設定があればフォールバックに使う）

本番（Render）では、`GOOGLE_REDIRECT_URI` を本番 URL に変え、上記キーを Environment に登録する。

## デプロイ

デプロイ.txt の手順どおり、`git push` すると Render が自動でビルド・マイグレーション・公開を行う（Render の Build Command に `npx prisma migrate deploy` が含まれている前提）。
