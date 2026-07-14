import "dotenv/config";
import express from "express";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } 
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ["query"] });

const app = express();
const PORT = process.env.PORT || 8888;

// EJS を使って画面を表示する設定じゃ
app.set("view engine", "ejs");
app.set("views", "./views");
// フォームから送られてきたデータを受け取れるようにする設定じゃ
app.use(express.urlencoded({ extended: true }));

// トップページ（/）にアクセスした時の処理
app.get("/", async (req, res) => {
  const users = await prisma.user.findMany();
  res.render("index", { users });
});

// ユーザー追加ボタンが押された時の処理
app.post("/users", async (req, res) => {
  const name = req.body.name;
  if (name) {
    await prisma.user.create({ data: { name } });
  }
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`サーバーが動いたぞ！: http://localhost:${PORT}`);
});
