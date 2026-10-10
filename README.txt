八千代リトルシニア パスキー重複エラー修正版 2026-10-10

対象エラー:
The user attempted to register an authenticator that contains one of the credentials already registered with the relying party.

更新ファイル:
- board-passkey.js
- board-access.js
- netlify/functions/passkey-auth.mjs

修正:
- Androidで端末側に既存パスキーが残っていても再登録で詰まらないように変更。
- 認証時はサーバー側IDで端末を絞り込まず、端末のCredential Managerから利用可能なパスキーを発見。
- 今後の新規登録は discoverable passkey (residentKey required) として作成。
- 既存パスキー重複エラーが出た場合は、再登録せずその既存パスキーで認証を試す。
- 他端末の登録済みパスキーは削除しない。

反映後:
問題端末は一度ページを閉じてから、ホーム→チーム専用ページで再度試してください。
パスワードへフォールバックした場合は、そのまま生体認証登録を押してOKです。
