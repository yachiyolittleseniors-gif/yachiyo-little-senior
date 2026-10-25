(() => {
  const endpoint = "/.netlify/functions/passkey-auth";
  const credentialKey = "yachiyoBoardPasskeyCredentialID";
  function savedCredentialID() {
    try { return localStorage.getItem(credentialKey) || ""; } catch (_) { return ""; }
  }
  function rememberCredentialID(value) {
    const id = String(value || "");
    try {
      if (id) localStorage.setItem(credentialKey, id);
      else localStorage.removeItem(credentialKey);
    } catch (_) {}
  }
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
      error.code = result.code || "";
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
    const output = {
      ...options,
      challenge: decode(options.challenge),
    };
    if (Array.isArray(options.allowCredentials) && options.allowCredentials.length) {
      output.allowCredentials = options.allowCredentials.map(item => ({ ...item, id: decode(item.id) }));
    } else {
      delete output.allowCredentials;
    }
    return output;
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
    let credential;
    try {
      credential = await navigator.credentials.create({ publicKey: creationOptions(start.options) });
    } catch (error) {
      const duplicate =
        error?.name === "InvalidStateError" ||
        /already registered|credentials already registered|contains one of the credentials/i.test(String(error?.message || ""));
      if (!duplicate) throw error;

      // The authenticator is telling us that a passkey for this RP already
      // exists. Use one explicit password-authenticated discovery only to bind
      // the existing Yachiyo credential to this browser.
      const proof = await bindExisting(accessValue);
      if (!proof?.token) throw error;
      try{localStorage.setItem("yachiyoBoardPasskeyRegistered","1")}catch(_){}
      try{sessionStorage.removeItem("yachiyoBoardPasskeyNeedsReregister")}catch(_){}
      return { ok: true, verified: true, existing: true, token: proof.token };
    }
    if (!credential) throw new Error("生体認証の登録がキャンセルされました。");
    const registered = await request({
      action: "registration-verify", ceremonyID: start.ceremonyID,
      credential: registrationJSON(credential), label,
    }, accessValue);
    rememberCredentialID(registered?.credentialID);

    // Do not display "registered" until the credential can actually be used
    // for a fresh sign-in.  This catches Android/Chrome cases where create()
    // completed but the active credential provider cannot subsequently find
    // the passkey, which otherwise leaves the UI falsely showing "registered".
    try {
      const proof = await authenticate();
      if (!proof?.token) throw new Error("登録確認に失敗しました。");
      try{sessionStorage.removeItem("yachiyoBoardPasskeyNeedsReregister")}catch(_){}
      return { ...registered, verified: true };
    } catch (error) {
      try{localStorage.removeItem("yachiyoBoardPasskeyRegistered")}catch(_){}
      try{sessionStorage.setItem("yachiyoBoardPasskeyNeedsReregister","1")}catch(_){}
      const verifyError = new Error(
        "パスキーを端末に保存できたか確認できませんでした。パスワードで入り直し、この端末にもう一度登録してください。"
      );
      verifyError.name = error?.name || "PasskeyVerificationError";
      throw verifyError;
    }
  }
  async function authenticateWithOptions({ discovery = false, accessValue = "" } = {}) {
    if (!supported()) throw new Error("この端末は生体認証に対応していません。");
    const credentialID = discovery ? "" : savedCredentialID();
    let start;
    try {
      start = await request({
        action: "authentication-options",
        ...(credentialID ? { credentialID } : {}),
        ...(discovery ? { discovery: true } : {}),
      }, accessValue);
    } catch (error) {
      if (error?.code === "PASSKEY_BINDING_STALE") rememberCredentialID("");
      throw error;
    }
    const credential = await navigator.credentials.get({ publicKey: requestOptions(start.options) });
    if (!credential) throw new Error("生体認証がキャンセルされました。");
    const result = await request({
      action: "authentication-verify", ceremonyID: start.ceremonyID,
      credential: authenticationJSON(credential),
    });
    if (result?.credentialID) rememberCredentialID(result.credentialID);
    return result;
  }
  async function authenticate() {
    return authenticateWithOptions();
  }
  async function bindExisting(accessValue = "") {
    if (!accessValue) throw new Error("パスワード認証後に生体認証を確認してください。");
    return authenticateWithOptions({ discovery: true, accessValue });
  }
  async function remove() {
    if (!supported()) throw new Error("この端末は生体認証に対応していません。");
    try {
      const auth = await authenticate();
      const credentialID = auth?.credentialID;
      if (!credentialID) throw new Error("削除する生体認証を確認できませんでした。");
      const result = await request({ action: "delete-credential", credentialID });
      rememberCredentialID("");
      try{sessionStorage.removeItem("yachiyoBoardPasskeyNeedsReregister")}catch(_){}
      return result;
    } catch (error) {
      // If Android says the locally registered passkey no longer exists, let
      // the page clear its local "registered" state.  The stale server record
      // is harmless and a new credential can be registered on this device.
      if (
        /Android/i.test(navigator.userAgent||"") &&
        (error?.name === "NotAllowedError" ||
         /利用可能なパスキー|passkey|credential/i.test(String(error?.message||"")))
      ) {
        try{sessionStorage.setItem("yachiyoBoardPasskeyNeedsReregister","1")}catch(_){}
        return { ok: true, stale: true };
      }
      throw error;
    }
  }
  window.YLSPasskeys = { authenticate, bindExisting, register, remove, supported };
})();
