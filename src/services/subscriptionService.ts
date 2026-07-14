// ─────────────────────────────────────────────────────────────
// サービス層（設計 Step 5 の「Service」）
// 「一覧の取得」「合計金額の計算」「更新日チェック」など、
// アプリの中身のロジックをここに集める。DB 操作は prisma 経由。
// ─────────────────────────────────────────────────────────────
import { prisma } from "../prisma";

// 更新通知（機能 D）で「もうすぐ」とみなす日数
const SOON_DAYS = 7;

export type NewSubscription = {
  name: string;
  price: number;
  billingDate: Date;
};

// 一覧を取得（機能 B の Read）。支払日が近い順に並べる。
export async function listSubscriptions(userId: number) {
  return prisma.subscription.findMany({
    where: { userId },
    orderBy: { billingDate: "asc" },
  });
}

// 新規登録（機能 A / Create）
export async function createSubscription(userId: number, data: NewSubscription) {
  return prisma.subscription.create({
    data: { ...data, userId },
  });
}

// 内容の更新（機能 / Update）。渡された項目だけ更新する。
export async function updateSubscription(
  id: number,
  userId: number,
  data: Partial<NewSubscription> & { isActive?: boolean }
) {
  // 念のため本人のデータかチェックしてから更新
  return prisma.subscription.updateMany({
    where: { id, userId },
    data,
  });
}

// 継続 / 停止の切り替え
export async function toggleActive(id: number, userId: number) {
  const sub = await prisma.subscription.findFirst({ where: { id, userId } });
  if (!sub) return null;
  return prisma.subscription.update({
    where: { id },
    data: { isActive: !sub.isActive },
  });
}

// 削除（Delete）
export async function deleteSubscription(id: number, userId: number) {
  return prisma.subscription.deleteMany({ where: { id, userId } });
}

// 1 件取得（編集画面用）
export async function getSubscription(id: number, userId: number) {
  return prisma.subscription.findFirst({ where: { id, userId } });
}

type Sub = Awaited<ReturnType<typeof listSubscriptions>>[number];

// 継続中のサブスクの月額合計を計算（機能 B の合計）
export function totalMonthly(subs: Sub[]): number {
  return subs
    .filter((s) => s.isActive)
    .reduce((sum, s) => sum + s.price, 0);
}

// 今日から支払日までの残り日数（過去なら負の数）
export function daysUntil(billingDate: Date): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(
    billingDate.getFullYear(),
    billingDate.getMonth(),
    billingDate.getDate()
  );
  const ms = target.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// 更新通知（機能 D）：継続中でもうすぐ更新（または過ぎている）ものを抽出
export function upcomingRenewals(subs: Sub[]) {
  return subs
    .filter((s) => s.isActive && daysUntil(s.billingDate) <= SOON_DAYS)
    .sort((a, b) => daysUntil(a.billingDate) - daysUntil(b.billingDate));
}

export const soonDays = SOON_DAYS;
