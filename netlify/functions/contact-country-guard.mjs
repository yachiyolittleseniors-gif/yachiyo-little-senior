export default function contactCountryGuard(request, context) {
  if (request.method !== "POST") return;

  const countryCode = context.geo?.country?.code;
  if (!countryCode || countryCode === "JP") return;

  const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>送信できません｜八千代リトルシニア</title>
<style>body{margin:0;background:#f5f3ee;color:#071426;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.box{max-width:560px;margin:12vh auto;padding:32px 22px;text-align:center;background:#fff;border:1px solid #d7b457;border-radius:16px}.en{color:#b58b28;font-weight:800;letter-spacing:.15em}.btn{display:block;margin-top:24px;padding:14px;border-radius:10px;background:#071426;color:#fff;text-decoration:none;font-weight:800}</style>
</head><body><main class="box"><p class="en">CONTACT FORM</p><h1>送信できませんでした</h1><p>お問い合わせフォームは日本国内からのみ送信できます。</p><a class="btn" href="/contact.html">お問い合わせページへ戻る</a></main></body></html>`;

  return new Response(html, {
    status: 403,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

export const config = {
  path: "/contact.html",
};
