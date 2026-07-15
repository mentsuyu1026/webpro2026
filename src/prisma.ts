// ─────────────────────────────────────────────────────────────
// Prisma（データベースの通訳・設計 Step 5 の「Prisma/Model 層」）
// PostgreSQL への接続をここ 1 か所にまとめる。
// 他のファイルはここから prisma を import して使う。
// ─────────────────────────────────────────────────────────────
import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// Render の外部接続には SSL が必要（デプロイ演習で成功した設定を引き継ぐ）
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

// ログイン中のユーザーを ID で取得する（セッションの userId から引く）
export async function getUserById(id: number) {
  return prisma.user.findUnique({ where: { id } });
}
