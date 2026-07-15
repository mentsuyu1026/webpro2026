// ─────────────────────────────────────────────────────────────
// アプリの入口（サブスク番人）
// Express の準備をして、認証ルートと（ログイン必須の）サブスクルートを取り付ける。
// 実際の処理は src/ 以下の各層（Router → Controller → Service → Prisma）に分けてある。
// ─────────────────────────────────────────────────────────────
import "dotenv/config";
import express from "express";
import session from "express-session";
import { router } from "./src/routes/subscriptions";
import { authRouter, requireLogin } from "./src/auth";

const app = express();
const PORT = process.env.PORT || 8888;

// EJS で画面を表示する設定
app.set("view engine", "ejs");
app.set("views", "./views");

// フォームから送られてきたデータを受け取れるようにする
app.use(express.urlencoded({ extended: true }));

// public/ 以下（CSS など）を静的配信
app.use(express.static("public"));

// セッション（ログイン状態を Cookie で保持する）
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 日間
  })
);

// 認証ルート（/login・/auth/google・/logout など）はログイン不要
app.use("/", authRouter);

// サブスク関連ルートはログイン必須
app.use("/", requireLogin, router);

app.listen(PORT, () => {
  console.log(`サーバーを起動しました: http://localhost:${PORT}`);
});
