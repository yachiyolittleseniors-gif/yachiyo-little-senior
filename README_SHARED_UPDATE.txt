八千代リトルシニア 共有更新対応版

この版では「予定」「試合結果」「ギャラリー」をNetlify Blobsに保存します。
公開後、管理者がスマホから更新すると閲覧者全員に反映されます。

Netlify側で必要な設定:
1. このフォルダをGit連携またはNetlify CLIでデプロイしてください。
2. Project configuration > Environment variables で
   ADMIN_PASSWORD を設定してください。
3. 再デプロイしてください。

※ ADMIN_PASSWORDはHTMLには保存されません。
※ 既存の問い合わせフォーム(Netlify Forms)はそのままです。

追加対応:
- 管理者用編集UIの分離
- トップに次回予定/最新結果/最新写真
- スマホ表示調整
- 試合結果の年度/大会フィルター
- ギャラリー拡大表示
- SEO/OGP/Twitter/Favicon/robots/sitemap

公開URL確定後、sitemap.xml内の https://example.com をNetlifyの実URLに変更してください。

最終仕上げ対応:
- トップ最新情報をニュース風に調整
- 入団案内に体験参加CTAを追加
- 選手紹介スマホ表示改善
- 試合結果レイアウト統一
- 予定に種類（練習/公式戦/練習試合/その他）を追加
- ギャラリーに前へ/次へを追加
- お問い合わせ完了画面を整理

公開URLが確定したら、sitemap.xml内の https://example.com を本番URLへ変更してください。

追加の最終仕上げ:
- ページ下部画像の遅延読み込み
- ギャラリー画像をさらに軽量化（最大1000×750、JPEG品質68%）
- 写真アップロード上限を12MB／最大120枚に設定
- 管理者ボタン位置をスマホ向けに調整
- 404.html追加
- privacy.html / terms.html追加
- Google Analytics 4用コードを無効状態で準備
- robots.txt / sitemap.xml更新

本番URL確定後:
1. sitemap.xml と robots.txt の https://example.com を本番URLに変更
2. 必要なら各HTMLのOGP URL/画像を本番URLに設定
3. GA4を使う場合は G-XXXXXXXXXX を測定IDに置換しコメント解除
