// ─────────────────────────────────────────────────────────────
// ルーター＋コントローラー（設計 Step 5 の「Router / Controller」）
// URL（注文）を受けて、入力をチェックし、サービス層に処理を頼む。
// このルーターは requireLogin で保護されるので、常にログイン済み。
// 操作対象のユーザーは req.session.userId で決まる。
//
// 設計 Step 4 の REST 設計との対応:
//   GET    /subscriptions        一覧（本アプリでは / がダッシュボード）
//   POST   /subscriptions        新規登録（機能 A）
//   PATCH  /subscriptions/:id  → POST /subscriptions/:id/update（HTML フォーム都合）
//   DELETE /subscriptions/:id  → POST /subscriptions/:id/delete
//   POST   /sync-gmail           Gmail 同期（機能 C）
// ※ HTML の <form> は GET/POST しか送れないため、PATCH/DELETE は POST で代用している。
// ─────────────────────────────────────────────────────────────
import { Router } from "express";
import { getUserById } from "../prisma";
import * as service from "../services/subscriptionService";
import { syncGmail } from "../services/gmailService";

export const router = Router();

// ログイン中ユーザーの ID をセッションから取り出す
function currentUserId(req: any): number {
  return req.session.userId as number;
}

// トップ（ダッシュボード）：一覧・合計・更新通知をまとめて表示（機能 B・D）
router.get("/", async (req, res) => {
  const userId = currentUserId(req);
  const user = await getUserById(userId);
  const subscriptions = await service.listSubscriptions(userId);
  res.render("index", {
    user,
    subscriptions,
    total: service.totalMonthly(subscriptions),
    upcoming: service.upcomingRenewals(subscriptions),
    soonDays: service.soonDays,
    daysUntil: service.daysUntil,
    flash: req.query.msg ?? null,
  });
});

// 新規登録（機能 A / Create）
router.post("/subscriptions", async (req, res) => {
  const userId = currentUserId(req);
  const name = (req.body.name ?? "").trim();
  const price = Number(req.body.price);
  const billingDate = req.body.billingDate ? new Date(req.body.billingDate) : null;

  // 入力チェック（コントローラーの役目）
  if (name && Number.isFinite(price) && price >= 0 && billingDate) {
    await service.createSubscription(userId, { name, price, billingDate });
  }
  res.redirect("/");
});

// 編集画面を表示
router.get("/subscriptions/:id/edit", async (req, res) => {
  const userId = currentUserId(req);
  const subscription = await service.getSubscription(Number(req.params.id), userId);
  if (!subscription) return res.redirect("/");
  res.render("edit", { subscription });
});

// 内容の更新（Update）
router.post("/subscriptions/:id/update", async (req, res) => {
  const userId = currentUserId(req);
  const name = (req.body.name ?? "").trim();
  const price = Number(req.body.price);
  const billingDate = req.body.billingDate ? new Date(req.body.billingDate) : undefined;

  await service.updateSubscription(Number(req.params.id), userId, {
    ...(name ? { name } : {}),
    ...(Number.isFinite(price) ? { price } : {}),
    ...(billingDate ? { billingDate } : {}),
  });
  res.redirect("/");
});

// 継続 / 停止の切り替え
router.post("/subscriptions/:id/toggle", async (req, res) => {
  const userId = currentUserId(req);
  await service.toggleActive(Number(req.params.id), userId);
  res.redirect("/");
});

// 削除（Delete）
router.post("/subscriptions/:id/delete", async (req, res) => {
  const userId = currentUserId(req);
  await service.deleteSubscription(Number(req.params.id), userId);
  res.redirect("/");
});

// Gmail 同期（機能 C）：ログイン中ユーザー自身の Gmail を対象にする。
router.post("/sync-gmail", async (req, res) => {
  const userId = currentUserId(req);
  const result = await syncGmail(userId);
  res.redirect("/?msg=" + encodeURIComponent(result.message));
});
