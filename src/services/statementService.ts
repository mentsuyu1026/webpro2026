// ─────────────────────────────────────────────────────────────
// 利用明細スクショの読み取りサービス
// アップロードされた画像を OCR（文字認識）し、
// 「サービス名＋金額」の候補を抜き出す。
// OCR には tesseract.js（無料・APIキー不要）を使う。
// ─────────────────────────────────────────────────────────────
// tesseract.js は重いので、起動時ではなく OCR 実行時に遅延読み込みする
// （起動時 import で失敗するとアプリ全体が落ちるのを防ぐ）

export type Candidate = { name: string; price: number };

// 全角の数字・記号を半角に直す
function normalize(s: string): string {
  return s
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/，/g, ",")
    .replace(/．/g, ".")
    .replace(/￥/g, "¥");
}

// 1 行から金額（円）を取り出す
function priceOf(line: string): number | null {
  const t = normalize(line);
  const patterns = [/¥\s?([0-9,]+)/, /([0-9,]+)\s?円/, /JPY\s?([0-9,]+)/i, /([0-9,]+)\s?JPY/i];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

// 画像（バッファ）を OCR してテキストにする
export async function ocrImage(buffer: Buffer): Promise<string> {
  const mod: any = await import("tesseract.js"); // 実行時に読み込む
  const recognize = mod.recognize ?? mod.default?.recognize;
  const { data } = await recognize(buffer, "jpn+eng");
  return data.text ?? "";
}

// OCR テキストから「サービス名＋金額」の候補を抜き出す
export function extractCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const price = priceOf(line);
    if (price == null) continue;

    // 金額部分を取り除いた残りをサービス名とみなす
    let name = normalize(line)
      .replace(/¥\s?[0-9,]+/g, " ")
      .replace(/[0-9,]+\s?円/g, " ")
      .replace(/[0-9,]+\s?JPY/gi, " ")
      .replace(/JPY\s?[0-9,]+/gi, " ")
      .replace(/[|:：\-—―・_>＞．.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (name.length < 2) name = "（名称不明）";
    if (name.length > 40) name = name.slice(0, 40);

    const key = name + "|" + price;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, price });
  }
  return out;
}
