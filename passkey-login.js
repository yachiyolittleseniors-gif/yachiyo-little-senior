(() => {
  // The password form includes a small recovery action for existing passkeys.
  // It never probes for a passkey until the user selects that method.
  window.YLSPasskeyLogin = async function ({ title, authenticate }) {
    if (!document.body) await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'yls-passkey-login';
      overlay.innerHTML = '<form class="yls-passkey-login-card" role="dialog" aria-modal="true" aria-labelledby="ylsLoginTitle" tabindex="-1"><label id="ylsLoginTitle" for="ylsLoginPassword">パスワードを入力してください。</label><input id="ylsLoginPassword" type="password" name="password" autocomplete="current-password" aria-required="true"><div class="yls-passkey-login-actions"><button type="button" data-login="cancel">キャンセル</button><button type="submit" data-login="password" class="yls-passkey-login-primary">OK</button></div><button type="button" data-login="passkey" class="yls-passkey-login-recover">登録済みのパスキーを使う</button><p class="yls-passkey-login-status" role="status" aria-live="polite"></p></form>';
      const card = overlay.querySelector('form');
      const input = overlay.querySelector('input');
      input.setAttribute('aria-label', title + 'のパスワード');
      const status = overlay.querySelector('[role="status"]');
      const buttons = [...overlay.querySelectorAll('button')];
      let busy = false, finished = false;
      const previousFocus = document.activeElement;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      const finish = result => {
        if (finished) return;
        finished = true;
        document.removeEventListener('keydown', onKeyDown, true);
        overlay.remove();
        document.body.style.overflow = previousOverflow;
        if (previousFocus?.isConnected) previousFocus.focus();
        resolve(result);
      };
      function onKeyDown(event) {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); finish({ method: 'cancel' }); }
        if (event.key !== 'Tab') return;
        const enabled = [input, ...buttons].filter(control => !control.disabled);
        if (!enabled.length) { event.preventDefault(); card.focus(); return; }
        const first = enabled[0], last = enabled[enabled.length - 1];
        if (event.shiftKey && (document.activeElement === first || !enabled.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !enabled.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
      card.addEventListener('submit', event => {
        event.preventDefault();
        if (busy || finished) return;
        if (!input.value) { status.textContent = 'パスワードを入力してください。'; input.focus(); return; }
        const password = input.value;
        input.value = '';
        finish({ method: 'password', password });
      });
      buttons.forEach(button => button.addEventListener('click', async () => {
        if (busy || finished) return;
        const method = button.dataset.login;
        if (method === 'password') return; // Handled by the form's submit event.
        if (method === 'cancel') { input.value = ''; finish({ method }); return; }
        busy = true;
        input.disabled = true;
        buttons.forEach(item => { item.disabled = true; });
        status.textContent = '端末で認証してください。';
        try {
          const value = await authenticate();
          if (!value) throw new Error('Authentication was not completed');
          input.value = '';
          finish({ method: 'passkey', value });
        } catch (error) {
          status.textContent = error?.name === 'NotAllowedError'
            ? '認証を中断しました。もう一度試すか、パスワードでログインしてください。'
            : 'パスキーで認証できませんでした。もう一度試すか、パスワードでログインしてください。';
        } finally {
          busy = false;
          if (!finished) { input.disabled = false; buttons.forEach(item => { item.disabled = false; }); button.focus(); }
        }
      }));
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKeyDown, true);
      input.focus();
    });
  };
})();
