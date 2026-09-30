(() => {
  const endpoint = "/.netlify/functions/operator-passkey-auth";
  // The old marker could be set by another device's server-side registration.
  // This marker is written only after this browser successfully registers/authenticates.
  const registrationKey = "yachiyoOperatorPasskeyVerified";
  function isRegistered() {
    try { return localStorage.getItem(registrationKey) === "1"; } catch (_) { return false; }
  }
  function rememberRegistration() {
    try { localStorage.setItem(registrationKey, "1"); } catch (_) {}
  }
  function supported() {
    return Boolean(window.PublicKeyCredential && navigator.credentials && typeof navigator.credentials.create === "function" && typeof navigator.credentials.get === "function");
  }
  function decode(value) {
    const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  }
  function encode(value) {
    let binary = "";
    new Uint8Array(value).forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }
  async function request(body, accessValue = "") {
    const headers = { "content-type": "application/json" };
    if (accessValue) headers["x-coach-password"] = accessValue;
    const response = await fetch(endpoint, {
      method: "POST", headers, credentials: "same-origin", body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || "生体認証を完了できませんでした。");
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function creationOptions(options) {
    return {
      ...options,
      challenge: decode(options.challenge),
      user: { ...options.user, id: decode(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map(item => ({ ...item, id: decode(item.id) })),
    };
  }
  function requestOptions(options) {
    return {
      ...options,
      challenge: decode(options.challenge),
      allowCredentials: (options.allowCredentials || []).map(item => ({ ...item, id: decode(item.id) })),
    };
  }
  function registrationJSON(credential) {
    return {
      id: credential.id, rawId: encode(credential.rawId), type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        attestationObject: encode(credential.response.attestationObject),
        clientDataJSON: encode(credential.response.clientDataJSON),
        transports: typeof credential.response.getTransports === "function"
          ? credential.response.getTransports() : [],
      },
    };
  }
  function authenticationJSON(credential) {
    return {
      id: credential.id, rawId: encode(credential.rawId), type: credential.type,
      authenticatorAttachment: credential.authenticatorAttachment,
      clientExtensionResults: credential.getClientExtensionResults(),
      response: {
        authenticatorData: encode(credential.response.authenticatorData),
        clientDataJSON: encode(credential.response.clientDataJSON),
        signature: encode(credential.response.signature),
        userHandle: credential.response.userHandle ? encode(credential.response.userHandle) : null,
      },
    };
  }

  function friendlyError(error, fallback = "生体認証を完了できませんでした。") {
    const name = String(error?.name || "");
    if (name === "InvalidStateError") {
      return new Error("この端末にはすでに生体認証が登録されています。登録済みの生体認証を利用するか、いったん削除してから再登録してください。");
    }
    if (name === "NotAllowedError") return error;
    return error instanceof Error ? error : new Error(fallback);
  }
  async function register(accessValue, label = "") {
    if (!supported()) throw new Error("この端末は生体認証に対応していません。");
    const start = await request({ action: "registration-options" }, accessValue);
    let credential;
    try {
      credential = await navigator.credentials.create({ publicKey: creationOptions(start.options) });
    } catch (error) {
      throw friendlyError(error, "生体認証を登録できませんでした。");
    }
    if (!credential) throw new Error("生体認証の登録がキャンセルされました。");
    const result = await request({
      action: "registration-verify", ceremonyID: start.ceremonyID,
      credential: registrationJSON(credential), label,
    }, accessValue);
    rememberRegistration();
    return result;
  }
  let authenticationInFlight = null;
  async function authenticateOnce() {
    if (!supported()) throw new Error("この端末は生体認証に対応していません。");
    const start = await request({ action: "authentication-options" });
    let credential;
    try {
      credential = await navigator.credentials.get({ publicKey: requestOptions(start.options) });
    } catch (error) {
      throw friendlyError(error, "生体認証を利用できませんでした。");
    }
    if (!credential) throw new Error("生体認証がキャンセルされました。");
    const result = await request({
      action: "authentication-verify", ceremonyID: start.ceremonyID,
      credential: authenticationJSON(credential),
    });
    if (result?.token) rememberRegistration();
    return result;
  }
  async function authenticate() {
    if (authenticationInFlight) return authenticationInFlight;
    authenticationInFlight = authenticateOnce();
    try {
      return await authenticationInFlight;
    } finally {
      authenticationInFlight = null;
    }
  }
  async function remove() {
    if (!supported()) throw new Error("この端末は生体認証に対応していません。");
    const auth = await authenticate();
    const credentialID = auth?.credentialID;
    if (!credentialID) throw new Error("削除する生体認証を確認できませんでした。");
    const result = await request({ action: "delete-credential", credentialID });
    try { localStorage.removeItem(registrationKey); } catch (_) {}
    return result;
  }
  async function chooseLoginMethod(message = '') {
    if (!document.body) await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', '運営用ログイン');
      overlay.style.cssText = 'visibility:visible;position:fixed;inset:0;z-index:50000;display:grid;place-items:center;padding:20px;background:#071426;';
      const card = document.createElement('div');
      card.style.cssText = 'width:100%;max-width:360px;padding:24px;border:1px solid #c79a3b;border-radius:16px;background:#0c1d33;color:#fff;text-align:center;font-family:system-ui,sans-serif;';
      const title = document.createElement('h2');
      title.textContent = '運営用ログイン';
      title.style.cssText = 'margin:0 0 14px;font-size:20px;color:#e2bd67;';
      const text = document.createElement('p');
      text.textContent = message || '登録済みの方は、生体認証でログインできます。';
      text.style.cssText = 'margin:0 0 18px;font-size:14px;line-height:1.7;';
      card.append(title, text);
      function addButton(label, method, primary) {
        const button = document.createElement('button');
        button.type = 'button';button.textContent = label;
        button.style.cssText = 'display:block;width:100%;min-height:48px;margin:10px 0;padding:12px;border:1px solid #c79a3b;border-radius:10px;font:700 15px system-ui;cursor:pointer;background:'+(primary?'#c79a3b':'transparent')+';color:'+(primary?'#071426':'#fff')+';';
        button.addEventListener('click', () => { overlay.remove();resolve(method); }, { once: true });
        card.append(button);
        return button;
      }
      const first = addButton('生体認証でログイン', 'passkey', true);
      addButton('パスワードでログイン', 'password', false);
      addButton('戻る', 'cancel', false);
      overlay.append(card);document.body.append(overlay);first.focus();
    });
  }
  async function authorize(promptMessage = "パスワードを入力してください。") {
    if (supported() && isRegistered()) {
      try {
        const result = await authenticate();
        if (result?.token) {
          try { sessionStorage.setItem("yachiyoCoachAttendancePass", result.token); } catch (error) {}
          return result.token;
        }
      } catch (error) {
        // No registered passkey / cancelled / failed: fall back to password.
      }
    }
    // A browser cannot reliably detect a synced passkey without opening WebAuthn.
    // Let the user select it before requiring a password, then remember a success.
    if (supported()) {
      let message = '';
      while (true) {
        const method = await chooseLoginMethod(message);
        if (method === 'cancel') return '';
        if (method === 'password') break;
        try {
          const result = await authenticate();
          if (result?.token) {
            try { sessionStorage.setItem('yachiyoCoachAttendancePass', result.token); } catch (_) {}
            return result.token;
          }
        } catch (error) {
          message = error?.name === 'NotAllowedError' ? 'ログイン方法を選んでください。' : '生体認証を確認できませんでした。パスワードでもログインできます。';
        }
      }
    }
    const entered = prompt(promptMessage);
    if (entered === null) return "";
    try {
      const response = await fetch("/.netlify/functions/coach-attendance-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "verifyCoachPassword", password: entered }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok) {
        const value = result.token || entered;
        try { sessionStorage.setItem("yachiyoCoachAttendancePass", value); } catch (error) {}
        return value;
      }
    } catch (error) {}
    alert("パスワードが違います。");
    return "";
  }

  window.YLSOperatorPasskeys = { authenticate, authorize, register, remove, supported, isRegistered, status: () => request({ action: "status" }) };
})();
