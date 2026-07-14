# サブスク番人 (Webpro 2026)

払い続けているサブスクリプションをまとめて管理するアプリ。
設計壁打ち.txt の「サブスク番人」設計をもとに実装した。

## 構成（三層）

- フロントエンド：EJS（サーバーサイドレンダリング）+ CSS
- バックエンド：Node.js + Express + Prisma
- データベース：PostgreSQL（Render Postgres）

コードは設計 Step 5 の役割分担に沿って分けてある。

```
index.ts                         入口（Express の設定・ルーター取り付け）
src/
  prisma.ts                      Prisma クライアント＋現在ユーザー取得
  routes/subscriptions.ts        ルーター＋コントローラー（URL の振り分け・入力チェック）
  services/subscriptionService.ts サービス層（一覧・合計・更新日チェック）
  services/gmailService.ts       Gmail 連携（機能 C・雛形）
views/
  index.ejs                      ダッシュボード（一覧・合計・更新通知・登録）
  edit.ejs                       編集画面
public/style.css                 スタイル
prisma/schema.prisma             データ設計（User 1 - n Subscription）
```

## データ設計

- **User**: id, email, name
- **Subscription**: id, userId(FK), name, price, billingDate, isActive
- User 1 : n Subscription

## 機能

- A. 手動登録（サービス名・金額・次の支払日）
- B. 一覧表示と継続中の月額合計
- C. Gmail から自動取り込み（**雛形**。googleapis と Google OAuth の設定が必要）
- D. 更新通知（支払日が 7 日以内 / 過ぎているサブスクをダッシュボード上部に表示）
- サブスクの編集・停止/再開・削除

※ ログイン機能は未実装。今は固定の「デモユーザー」を使う（設計 Step 5 の発展課題）。

## セットアップと起動

スキーマを変更したので、**初回は必ずマイグレーションと Client 生成を行うこと。**

```bash
# 1. 依存関係（未インストールなら）
npm install

# 2. DB にテーブルを作成し、Prisma Client を生成
npx prisma migrate dev --name add_subscription
npx prisma generate

# 3. 起動
npm start
```

ブラウザで http://localhost:8888/ を開く。

`.env` の `DATABASE_URL` は Render Postgres の External URL を設定済み。

## Gmail 連携（機能 C）を有効にするには

`src/services/gmailService.ts` のコメント参照。おおまかには:

1. `npm install googleapis`
2. Google Cloud Console で Gmail API を有効化し OAuth クライアントを作成
3. `.env` に `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` を追加
4. `gmailService.ts` 内の実装コメントを有効化

## デプロイ

デプロイ.txt の手順どおり、`git push` すると Render が自動でビルド・マイグレーション・公開を行う（Render の Build Command に `npx prisma migrate deploy` が含まれている前提）。
