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
import multer from "multer";
import { getUserById } from "../prisma";
import * as service from "../services/subscriptionService";
import { syncGmail } from "../services/gmailService";
import { ocrImage, extractCandidates } from "../services/statementService";

export const router = Router();

// 画像アップロード（メモリ上に保持。最大 8MB）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// ログイン中ユーザーの ID をセッションから取り出す
function currentUserId(req: any): number {
  return req.session.userId as number;
}

// すべての画面共通で、ヘッダー表示用のユーザー情報を渡す
router.use(async (req: any, res, next) => {
  res.locals.user = await getUserById(currentUserId(req));
  res.locals.picture = req.session.picture ?? null;
  next();
});

// カレンダー用データを作る（月次更新なので「日」だけあればよい）
function toCalendarData(subs: Awaited<ReturnType<typeof service.listSubscriptions>>) {
  return subs
    .filter((s) => s.isActive)
    .map((s) => ({ name: s.name, price: s.price, day: s.billingDate.getDate() }));
}

// トップ（ダッシュボード）：一覧・合計・更新通知を表示（機能 B・D）
router.get("/", async (req: any, res) => {
  const userId = currentUserId(req);
  const subscriptions = await service.listSubscriptions(userId);
  res.render("index", {
    subscriptions,
    total: service.totalMonthly(subscriptions),
    upcoming: service.upcomingRenewals(subscriptions),
    soonDays: service.soonDays,
    daysUntil: service.daysUntil,
    nextRenewal: service.nextRenewal,
    flash: req.query.msg ?? null,
  });
});

// カレンダー画面（別タブ）
router.get("/calendar", async (req: any, res) => {
  const userId = currentUserId(req);
  const subscriptions = await service.listSubscriptions(userId);
  res.render("calendar", { calendarData: toCalendarData(subscriptions) });
});

// 明細スクショのアップロード画面（別タブ）
router.get("/import", (req, res) => {
  res.render("import", { flash: null });
});

// アップロードされた画像を OCR してサブスク候補を表示
router.post("/import", upload.single("screenshot"), async (req: any, res) => {
  if (!req.file) return res.render("import", { flash: "画像が選択されていません。" });
  try {
    const text = await ocrImage(req.file.buffer);
    const candidates = extractCandidates(text);
    res.render("candidates", { candidates });
  } catch (e) {
    console.error("OCR に失敗:", e);
    res.render("import", { flash: "画像の読み取りに失敗しました。別の画像でお試しください。" });
  }
});

// 選ばれた候補をサブスクとして登録する
router.post("/import/confirm", async (req: any, res) => {
  const userId = currentUserId(req);
  const picks = ([] as string[]).concat(req.body.pick ?? []);
  let added = 0;
  for (const idx of picks) {
    const name = (req.body["name_" + idx] ?? "").trim();
    const price = Number(req.body["price_" + idx]);
    if (name && Number.isFinite(price) && price >= 0) {
      // 支払日は今日を初期値に（次回更新日は毎月この日で計算される）。後で編集可能。
      await service.createSubscription(userId, { name, price, billingDate: new Date() });
      added++;
    }
  }
  res.redirect("/?msg=" + encodeURIComponent(`${added} 件を追加しました。`));
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
