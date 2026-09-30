(() => {
  // This explicit choice also works after browser site data has been cleared.
  // It never probes for a passkey until the user selects that method.
  window.YLSPasskeyLogin = async function ({ title, authenticate }) {
    if (!document.body) await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'yls-passkey-login';
      overlay.innerHTML = '<section class="yls-passkey-login-card" role="dialog" aria-modal="true" aria-labelledby="ylsLoginTitle" tabindex="-1"><p class="yls-passkey-login-label">YACHIYO LITTLE SENIOR</p><h2 id="ylsLoginTitle"></h2><p class="yls-passkey-login-copy">ログイン方法を選んでください。</p><button type="button" data-login="password" class="yls-passkey-login-primary">パスワードでログイン</button><button type="button" data-login="passkey">登録済みのパスキーでログイン</button><p class="yls-passkey-login-help">以前、生体認証を登録した方は<br>パスキーでログインできます。</p><p class="yls-passkey-login-status" role="status" aria-live="polite"></p><button type="button" data-login="cancel" class="yls-passkey-login-cancel">戻る</button></section>';
      overlay.querySelector('h2').textContent = title;
      const card = overlay.querySelector('section');
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
        const enabled = buttons.filter(button => !button.disabled);
        if (!enabled.length) { event.preventDefault(); card.focus(); return; }
        const first = enabled[0], last = enabled[enabled.length - 1];
        if (event.shiftKey && (document.activeElement === first || !enabled.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !enabled.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
      buttons.forEach(button => button.addEventListener('click', async () => {
        if (busy || finished) return;
        const method = button.dataset.login;
        if (method !== 'passkey') { finish({ method }); return; }
        busy = true;
        buttons.forEach(item => { item.disabled = true; });
        status.textContent = '端末で認証してください。';
        try {
          const value = await authenticate();
          if (!value) throw new Error('Authentication was not completed');
          finish({ method: 'passkey', value });
        } catch (error) {
          status.textContent = error?.name === 'NotAllowedError'
            ? '認証を中断しました。もう一度試すか、パスワードでログインしてください。'
            : 'パスキーで認証できませんでした。もう一度試すか、パスワードでログインしてください。';
        } finally {
          busy = false;
          if (!finished) { buttons.forEach(item => { item.disabled = false; }); button.focus(); }
        }
      }));
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKeyDown, true);
      buttons[0].focus();
    });
  };
})();
