// ─────────────────────────────────────────────────────────────
// Prisma（データベースの通訳・設計 Step 5 の「Prisma/Model 層」）
// PostgreSQL への接続をここ 1 か所にまとめておくぞ。
// 他のファイルはここから prisma を import して使う。
// ─────────────────────────────────────────────────────────────
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Render の外部接続には SSL が必要じゃ（デプロイ演習で成功した設定を引き継ぐ）
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter, log: ["query"] });

// アプリ終了時に接続を閉じる
export async function disconnect() {
  await Promise.all([prisma.$disconnect(), pool.end()]);
}

// ─────────────────────────────────────────────────────────────
// デモ用ユーザーの取得（ログイン機能は設計 Step 5 の発展課題）
// 今はログイン画面を作らず、固定の「デモユーザー」を 1 人使う。
// Users テーブルと Subscriptions テーブルの 1 対多の関係はそのまま活きている。
// 将来ログイン（Cookie / セッション）を足すときは、ここを
// 「ログイン中のユーザーを返す」処理に差し替えればよい。
// ─────────────────────────────────────────────────────────────
const DEMO_EMAIL = "demo@example.com";

export async function getCurrentUser() {
  return prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: "ゲスト" },
  });
}
