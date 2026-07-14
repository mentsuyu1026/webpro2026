// ─────────────────────────────────────────────────────────────
// ルーター＋コントローラー（設計 Step 5 の「Router / Controller」）
// URL（注文）を受けて、入力をチェックし、サービス層に処理を頼む。
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
import { getCurrentUser } from "../prisma";
import * as service from "../services/subscriptionService";
import { syncGmail } from "../services/gmailService";

export const router = Router();

// トップ（ダッシュボード）：一覧・合計・更新通知をまとめて表示（機能 B・D）
router.get("/", async (req, res) => {
  const user = await getCurrentUser();
  const subscriptions = await service.listSubscriptions(user.id);
  res.render("index", {
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
  const user = await getCurrentUser();
  const name = (req.body.name ?? "").trim();
  const price = Number(req.body.price);
  const billingDate = req.body.billingDate ? new Date(req.body.billingDate) : null;

  // 入力チェック（コントローラーの役目）
  if (name && Number.isFinite(price) && price >= 0 && billingDate) {
    await service.createSubscription(user.id, { name, price, billingDate });
  }
  res.redirect("/");
});

// 編集画面を表示
router.get("/subscriptions/:id/edit", async (req, res) => {
  const user = await getCurrentUser();
  const subscription = await service.getSubscription(Number(req.params.id), user.id);
  if (!subscription) return res.redirect("/");
  res.render("edit", { subscription });
});

// 内容の更新（Update）
router.post("/subscriptions/:id/update", async (req, res) => {
  const user = await getCurrentUser();
  const name = (req.body.name ?? "").trim();
  const price = Number(req.body.price);
  const billingDate = req.body.billingDate ? new Date(req.body.billingDate) : undefined;

  await service.updateSubscription(Number(req.params.id), user.id, {
    ...(name ? { name } : {}),
    ...(Number.isFinite(price) ? { price } : {}),
    ...(billingDate ? { billingDate } : {}),
  });
  res.redirect("/");
});

// 継続 / 停止の切り替え
router.post("/subscriptions/:id/toggle", async (req, res) => {
  const user = await getCurrentUser();
  await service.toggleActive(Number(req.params.id), user.id);
  res.redirect("/");
});

// 削除（Delete）
router.post("/subscriptions/:id/delete", async (req, res) => {
  const user = await getCurrentUser();
  await service.deleteSubscription(Number(req.params.id), user.id);
  res.redirect("/");
});

// Gmail 同期（機能 C）：今は雛形。結果メッセージを付けてトップに戻す。
router.post("/sync-gmail", async (req, res) => {
  const user = await getCurrentUser();
  const result = await syncGmail(user.id);
  res.redirect("/?msg=" + encodeURIComponent(result.message));
});
