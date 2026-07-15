// ─────────────────────────────────────────────────────────────
// Google ログイン（認証）
// 各ユーザーが自分の Google アカウントでログインし、
// 自分のサブスク・自分の Gmail だけを扱えるようにする。
//
// 仕組み（設計 Step 5 の Cookie / セッション）:
//   1. /auth/google で Google の同意画面へリダイレクト
//   2. 同意すると /auth/google/callback に戻ってくる
//   3. ユーザー情報（メール・名前）を取得し、User テーブルに upsert
//   4. セッションに userId を保存 → 以降はログイン済みとして扱う
// ─────────────────────────────────────────────────────────────
import { Router } from "express";
import { google } from "googleapis";
import { prisma } from "./prisma";

export const authRouter = Router();

// 要求する権限（ログイン用 + Gmail 読み取り）
const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/gmail.readonly",
];

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI // 例: http://localhost:8888/auth/google/callback
  );
}

// ログイン画面
authRouter.get("/login", (req: any, res) => {
  if (req.session?.userId) return res.redirect("/");
  res.render("login");
});

// Google の同意画面へリダイレクト
authRouter.get("/auth/google", (req, res) => {
  const url = oauthClient().generateAuthUrl({
    access_type: "offline", // リフレッシュトークンを得るため
    prompt: "consent", // 毎回同意を求めてリフレッシュトークンを確実に受け取る
    scope: SCOPES,
  });
  res.redirect(url);
});

// Google からのコールバック
authRouter.get("/auth/google/callback", async (req: any, res) => {
  const code = req.query.code as string | undefined;
  if (!code) return res.redirect("/login");

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // ユーザー情報（メール・名前）を取得
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    const email = me.data.email;
    if (!email) return res.redirect("/login");
    const name = me.data.name ?? email;

    // メールをキーに User を登録／更新。
    // リフレッシュトークンは取得できた時だけ保存（Gmail 連携に使う）。
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        ...(tokens.refresh_token ? { googleRefreshToken: tokens.refresh_token } : {}),
      },
      create: {
        email,
        name,
        googleRefreshToken: tokens.refresh_token ?? null,
      },
    });

    req.session.userId = user.id;
    res.redirect("/");
  } catch (e) {
    console.error("Google ログインに失敗:", e);
    res.redirect("/login");
  }
});

// ログアウト
authRouter.post("/logout", (req: any, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// 認証チェック用ミドルウェア。未ログインなら /login へ。
export function requireLogin(req: any, res: any, next: any) {
  if (!req.session?.userId) return res.redirect("/login");
  next();
}
