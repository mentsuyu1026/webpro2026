// ─────────────────────────────────────────────────────────────
// Gmail 連携サービス（機能 C）— 雛形（スケルトン）
//
// 設計 Step 1〜4 の機能 C：
//   インプット: Gmail のメールデータ
//   ロジック  : 「領収書」「ご請求」等のワードで検索し、金額・日付を抜き出す
//   アウトプット: 見つけたサブスク候補を Subscriptions テーブルへ保存
//
// これを実際に動かすには、次の準備が必要じゃ（この環境では未設定）:
//   1. `npm install googleapis`
//   2. Google Cloud Console で OAuth クライアントを作成し、Gmail API を有効化
//   3. .env に認証情報を追加
//        GOOGLE_CLIENT_ID=...
//        GOOGLE_CLIENT_SECRET=...
//        GOOGLE_REDIRECT_URI=http://localhost:8888/auth/google/callback
//        GOOGLE_REFRESH_TOKEN=...   (ユーザー認可後に取得)
//
// 認証情報が揃うまでは、下の syncGmail() は「未設定」を返すだけにして
// アプリ全体が動くようにしてある。実装の骨組みは下部にコメントで残した。
// ─────────────────────────────────────────────────────────────

export type SyncResult = {
  configured: boolean;
  found: number;
  message: string;
};

function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
  );
}

// Gmail から領収書メールを探してサブスク候補を保存する（本実装は下記コメント参照）
export async function syncGmail(_userId: number): Promise<SyncResult> {
  if (!isConfigured()) {
    return {
      configured: false,
      found: 0,
      message:
        "Gmail 連携はまだ設定されていません。googleapis の導入と Google OAuth の認証情報（.env）が必要です。詳しくは src/services/gmailService.ts のコメントを参照してください。",
    };
  }

  // ── ここから下が「設定済み」のときに動く本実装の骨組み ──
  // 認証情報が揃ったら、以下の実装コメントを有効化する。
  //
  // import { google } from "googleapis";
  // import { prisma } from "../prisma";
  //
  // const auth = new google.auth.OAuth2(
  //   process.env.GOOGLE_CLIENT_ID,
  //   process.env.GOOGLE_CLIENT_SECRET,
  //   process.env.GOOGLE_REDIRECT_URI
  // );
  // auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  // const gmail = google.gmail({ version: "v1", auth });
  //
  // // 1. 領収書・請求メールを検索（インプット）
  // const query = "領収書 OR ご請求 OR subscription OR receipt";
  // const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 20 });
  //
  // let found = 0;
  // for (const msg of list.data.messages ?? []) {
  //   const full = await gmail.users.messages.get({ userId: "me", id: msg.id! });
  //   // 2. 本文から金額・サービス名・日付を抜き出す（ロジック）
  //   const parsed = parseSubscriptionFromMessage(full.data);
  //   if (!parsed) continue;
  //   // 3. Subscriptions テーブルへ保存（アウトプット）
  //   await prisma.subscription.create({ data: { ...parsed, userId: _userId } });
  //   found++;
  // }
  // return { configured: true, found, message: `${found} 件のサブスク候補を取り込みました。` };

  return {
    configured: true,
    found: 0,
    message:
      "Gmail 連携の本実装は未完成です（gmailService.ts の骨組みを有効化してください）。",
  };
}

// メール本文から { name, price, billingDate } を推定する関数（要実装）
// 例: 正規表現で「¥1,980」「月額980円」等から金額を、件名からサービス名を取る。
// function parseSubscriptionFromMessage(message: any):
//   { name: string; price: number; billingDate: Date } | null {
//   return null;
// }
