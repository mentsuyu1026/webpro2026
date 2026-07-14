// ─────────────────────────────────────────────────────────────
// アプリの入口（サブスク番人）
// ここでは Express の準備をして、ルーターを取り付けるだけ。
// 実際の処理は src/ 以下の各層（Router → Controller → Service → Prisma）に分けてある。
// ─────────────────────────────────────────────────────────────
import "dotenv/config";
import express from "express";
import { router } from "./src/routes/subscriptions";

const app = express();
const PORT = process.env.PORT || 8888;

// EJS で画面を表示する設定
app.set("view engine", "ejs");
app.set("views", "./views");

// フォームから送られてきたデータを受け取れるようにする
app.use(express.urlencoded({ extended: true }));

// public/ 以下（CSS など）を静的配信
app.use(express.static("public"));

// ルーターを取り付ける
app.use("/", router);

app.listen(PORT, () => {
  console.log(`サーバーを起動しました: http://localhost:${PORT}`);
});
