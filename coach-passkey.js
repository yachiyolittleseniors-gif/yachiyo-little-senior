(() => {
  const endpoint = "/.netlify/functions/coach-passkey-auth";
  function supported() {
    return Boolean(window.isSecureContext && window.PublicKeyCredential && navigator.credentials);
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
    if (accessValue) headers["x-access-password"] = accessValue;
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
  async function register(accessValue, label = "") {
    if (!supported()) throw new Error("この端末は生体認証に対応していません。");
    const start = await request({ action: "registration-options" }, accessValue);
    const credential = await navigator.credentials.create({ publicKey: creationOptions(start.options) });
    if (!credential) throw new Error("生体認証の登録がキャンセルされました。");
    return request({
      action: "registration-verify", ceremonyID: start.ceremonyID,
      credential: registrationJSON(credential), label,
    }, accessValue);
  }
  async function authenticate() {
    if (!supported()) throw new Error("この端末は生体認証に対応していません。");
    const start = await request({ action: "authentication-options" });
    const credential = await navigator.credentials.get({ publicKey: requestOptions(start.options) });
    if (!credential) throw new Error("生体認証がキャンセルされました。");
    return request({
      action: "authentication-verify", ceremonyID: start.ceremonyID,
      credential: authenticationJSON(credential),
    });
  }
  async function authorize(promptMessage = "パスワードを入力してください。") {
    let registered = false;
    try {
      registered = localStorage.getItem("yachiyoCoachPasskeyRegistered") === "1";
    } catch (error) {}

    if (registered && supported()) {
      try {
        const result = await authenticate();
        if (result?.token) {
          try { sessionStorage.setItem("yachiyoCoachAttendancePass", result.token); } catch (error) {}
          return result.token;
        }
      } catch (error) {}
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

  window.YLSCoachPasskeys = { authenticate, authorize, register, supported };
})();
