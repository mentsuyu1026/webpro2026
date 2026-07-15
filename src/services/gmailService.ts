// ─────────────────────────────────────────────────────────────
// Gmail 連携サービス（機能 C）
//
// 設計 Step 1〜4 の機能 C：
//   インプット: Gmail のメールデータ
//   ロジック  : 「領収書」「ご請求」等のワードで検索し、金額・日付を抜き出す
//   アウトプット: 見つけたサブスク候補を Subscriptions テーブルへ保存
//
// 認証情報が揃っていない場合は syncGmail() は「未設定」を返すだけになる。
// ─────────────────────────────────────────────────────────────

import { google } from "googleapis";
import { prisma } from "../prisma";

export type SyncResult = {
  configured: boolean;
  found: number;
  message: string;
};

// Gmail から領収書メールを探してサブスク候補を保存する。
// ログイン中ユーザー自身の Google リフレッシュトークンを使う
// （無ければ .env の GOOGLE_REFRESH_TOKEN にフォールバック）。
export async function syncGmail(userId: number): Promise<SyncResult> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return {
      configured: false,
      found: 0,
      message:
        "Gmail 連携が未設定です。GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET を .env に設定してください。",
    };
  }

  // このユーザーのリフレッシュトークンを取得
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const refreshToken = user?.googleRefreshToken ?? process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    return {
      configured: false,
      found: 0,
      message:
        "Gmail の読み取り許可がありません。一度ログアウトして Google で再ログインすると連携できます。",
    };
  }

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials({ refresh_token: refreshToken });
  const gmail = google.gmail({ version: "v1", auth });

  // 1. 継続課金（サブスク）っぽいメールに絞って検索（インプット）
  //    単発購入や広告を減らすため、月額・自動更新などのワードで検索する。
  const query =
    '"月額" OR "自動更新" OR "定期購入" OR "サブスクリプション" OR subscription OR "recurring" OR "次回のお支払い" OR "自動的に更新"';
  const list = await gmail.users.messages.list({ userId: "me", q: query, maxResults: 200 });
  console.log("ヒット件数:", list.data.messages?.length ?? 0);

  // 既存のサブスク名を集めておき、重複登録を防ぐ
  const existing = await prisma.subscription.findMany({
    where: { userId },
    select: { name: true },
  });
  const seen = new Set(existing.map((s) => s.name));

  let found = 0;
  let skipped = 0;
  let duplicate = 0;
  for (const msg of list.data.messages ?? []) {
    // 2. メール全体を取得して中身を解析（ロジック）
    const full = await gmail.users.messages.get({
      userId: "me",
      id: msg.id!,
      format: "full",
    });

    const subject = getHeader(full.data.payload, "Subject");
    const result = parseSubscriptionFromMessage(full.data);

    if ("skip" in result) {
      skipped++;
      console.log(`  ✗ 除外（${result.skip}）| 件名:「${subject}」`);
      continue;
    }
    if (seen.has(result.sub.name)) {
      duplicate++;
      console.log(`  = 重複でスキップ | ${result.sub.name}（¥${result.sub.price}）| 件名:「${subject}」`);
      continue;
    }

    // 3. Subscriptions テーブルへ保存（アウトプット）
    await prisma.subscription.create({ data: { ...result.sub, userId } });
    seen.add(result.sub.name);
    found++;
    console.log(`  ✓ 取り込み | ${result.sub.name}（¥${result.sub.price}）| 件名:「${subject}」`);
  }

  console.log(
    `結果: 取り込み ${found} 件 / 重複スキップ ${duplicate} 件 / 対象外で除外 ${skipped} 件`
  );

  const message =
    found > 0
      ? `${found} 件のサブスク候補を取り込みました（重複 ${duplicate} 件・対象外 ${skipped} 件は除外）。金額や支払日は推定値なので、必要に応じて編集してください。`
      : `新しいサブスク候補は見つかりませんでした（重複 ${duplicate} 件・対象外 ${skipped} 件を除外）。`;

  return { configured: true, found, message };
}

// ─────────────────────────────────────────────────────────────
// メール解析ヘルパー
// ─────────────────────────────────────────────────────────────

// ヘッダー（Subject / From / Date など）を名前で取り出す
function getHeader(payload: any, name: string): string {
  const h = payload?.headers?.find(
    (x: any) => x.name?.toLowerCase() === name.toLowerCase()
  );
  return h?.value ?? "";
}

// メール本文（text/plain・text/html）を再帰的に集めて 1 つの文字列にする
function collectText(payload: any): string {
  if (!payload) return "";
  let text = "";
  if (payload.body?.data) {
    try {
      // Gmail の本文は base64url でエンコードされている
      text += Buffer.from(payload.body.data, "base64url").toString("utf-8");
    } catch {
      // デコードできないパートは無視
    }
  }
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      text += "\n" + collectText(part);
    }
  }
  return text;
}

// 本文から金額（円）を抽出する
function extractPrice(text: string): number | null {
  const patterns = [
    /[¥￥]\s?([0-9,]+)/, // ¥1,980
    /([0-9,]+)\s?円/, // 1,980円 / 月額980円
    /JPY\s?([0-9,]+)/i, // JPY 1980
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

// 差出人・件名からサービス名を推定する
function extractName(from: string, subject: string): string {
  // 例: "Netflix" <info@netflix.com> → 表示名 "Netflix"
  const disp = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (disp && disp[1].trim()) return disp[1].trim();

  // 表示名がなければドメイン名（netflix.com → Netflix）
  const domain = from.match(/@([^>\s]+)/);
  if (domain) {
    const parts = domain[1].split(".");
    const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  return subject.slice(0, 30) || "不明なサービス";
}

// 支払日を推定する（メール受信日の 1 か月後を「次の支払日」の目安にする）
function extractDate(message: any): Date {
  let base: Date;
  if (message.internalDate) {
    base = new Date(Number(message.internalDate));
  } else {
    const d = getHeader(message.payload, "Date");
    base = d ? new Date(d) : new Date();
  }
  const next = new Date(base);
  next.setMonth(next.getMonth() + 1);
  return next;
}

type ParsedSub = { name: string; price: number; billingDate: Date };
type ParseResult = { sub: ParsedSub } | { skip: string };

// 広告・宣伝メールの手がかり（これらが含まれるメールは除外）
const PROMO_RE =
  /(OFF|オフ|半額|セール|SALE|クーポン|キャンペーン|割引|お得|始めてみません|ポイント|%|％|プレゼント|今なら)/i;
// 返金・キャンセルの手がかり（除外）
const REFUND_RE = /(refund|refunded|返金|払い戻し|キャンセル|返品)/i;
// 継続課金（サブスク）である手がかり（これが無いメールは除外）
const RECURRING_RE =
  /(月額|年額|自動更新|自動的に更新|定期購入|定期便|サブスクリプション|次回のお支払い|次回請求|継続課金|subscription|recurring|monthly|renew|will\s+renew|next\s+billing)/i;

// メール 1 通から { name, price, billingDate } を推定する。
// サブスクとみなせない場合は理由付きで skip を返す。
function parseSubscriptionFromMessage(message: any): ParseResult {
  const payload = message.payload;
  const subject = getHeader(payload, "Subject");
  const from = getHeader(payload, "From");

  // snippet（短い抜粋）＋ 本文を解析対象にし、HTML タグは除去する
  const raw = (message.snippet ?? "") + "\n" + collectText(payload);
  const text = raw.replace(/<[^>]+>/g, " ");
  const haystack = subject + "\n" + text; // 件名も判定に含める

  // 金額が取れないメールはサブスクとみなさない
  const price = extractPrice(text);
  if (price == null) return { skip: "金額なし" };

  // 広告・返金は除外
  if (REFUND_RE.test(haystack)) return { skip: "返金/キャンセル" };
  if (PROMO_RE.test(haystack)) return { skip: "広告/宣伝" };

  // 継続課金の手がかりが無ければ単発購入とみなして除外
  if (!RECURRING_RE.test(haystack)) return { skip: "継続課金の手がかりなし" };

  return {
    sub: {
      name: extractName(from, subject),
      price,
      billingDate: extractDate(message),
    },
  };
}
