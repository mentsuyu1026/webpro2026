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

// 今日から指定日までの残り日数（過去なら負の数）
export function daysUntil(date: Date): number {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const ms = target.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// base の「日」を保ったまま months か月進める（月末は月の最終日にクランプ）
function addMonthsClamped(base: Date, months: number): Date {
  const day = base.getDate();
  const first = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(day, lastDay));
}

// 次回更新日：サブスクは毎月更新なので、保存された支払日を
// 今日以降になるまで 1 か月ずつ繰り上げた日付を返す。
// （過去の受信日をそのまま「◯日前」と表示する不具合を防ぐ）
export function nextRenewal(billingDate: Date): Date {
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let n = 0;
  let d = addMonthsClamped(billingDate, 0);
  while (d < t0) {
    n += 1;
    d = addMonthsClamped(billingDate, n);
  }
  return d;
}

// 更新通知（機能 D）：継続中で次回更新が SOON_DAYS 日以内のものを抽出
export function upcomingRenewals(subs: Sub[]) {
  const days = (s: Sub) => daysUntil(nextRenewal(s.billingDate));
  return subs
    .filter((s) => s.isActive && days(s) <= SOON_DAYS)
    .sort((a, b) => days(a) - days(b));
}

export const soonDays = SOON_DAYS;
