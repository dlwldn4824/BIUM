/**
 * BIUM local store — tokens + config. Never stores file contents.
 */
const fs = require("fs");
const path = require("path");
const { app, safeStorage } = require("electron");

const FILE = () => path.join(app.getPath("userData"), "bium-store.json");

function readRaw() {
  try {
    return JSON.parse(fs.readFileSync(FILE(), "utf8"));
  } catch {
    return {};
  }
}

function writeRaw(data) {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(data, null, 2), "utf8");
}

function encrypt(text) {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      enc: true,
      value: safeStorage.encryptString(text).toString("base64"),
    };
  }
  return { enc: false, value: text };
}

function decrypt(payload) {
  if (!payload) return null;
  if (payload.enc) {
    return safeStorage.decryptString(Buffer.from(payload.value, "base64"));
  }
  return payload.value;
}

function maskClientId(id) {
  const s = String(id || "");
  if (!s) return "";
  if (s.length <= 14) return "••••••••••••";
  return `••••${s.slice(-12)}`;
}

function resolveGoogleClientId(raw = readRaw()) {
  return (
    raw.googleClientId ||
    process.env.BIUM_GOOGLE_CLIENT_ID ||
    process.env.DIGITAL_DIET_GOOGLE_CLIENT_ID ||
    ""
  );
}

function getConfig() {
  const raw = readRaw();
  const naver = (() => {
    try {
      return getToken("naver");
    } catch {
      return null;
    }
  })();
  const googleClientId = resolveGoogleClientId(raw);
  return {
    googleClientId,
    hasGoogleClientId: Boolean(googleClientId),
    googleClientIdHint: maskClientId(googleClientId),
    microsoftClientId:
      raw.microsoftClientId ||
      process.env.BIUM_MICROSOFT_CLIENT_ID ||
      process.env.DIGITAL_DIET_MICROSOFT_CLIENT_ID ||
      "",
    /** Email only — app password stays in encrypted token */
    naverEmail: naver?.email || raw.naverEmail || "",
    hasNaverCredentials: Boolean(naver?.email && naver?.appPassword),
    /** Hackathon: allow demo Drive index without real OAuth */
    demoCloud: raw.demoCloud !== false,
    /** Hackathon: allow demo Naver attachment index without IMAP */
    demoNaver: raw.demoNaver !== false,
    /** Show desktop pet wandering on the Mac screen */
    desktopPet: raw.desktopPet !== false,
    /** Mini UI theme: cozy | noir */
    theme: raw.theme === "noir" ? "noir" : "cozy",
  };
}

/** Safe for renderer — never includes full Client ID */
function getPublicConfig() {
  const cfg = getConfig();
  return {
    ...cfg,
    googleClientId: "",
    microsoftClientId: "",
  };
}

function setConfig(partial) {
  const raw = readRaw();
  Object.assign(raw, partial);
  writeRaw(raw);
  return getConfig();
}

function saveToken(provider, token) {
  const raw = readRaw();
  raw.tokens = raw.tokens || {};
  raw.tokens[provider] = encrypt(JSON.stringify(token));
  writeRaw(raw);
}

function getToken(provider) {
  const raw = readRaw();
  const payload = raw.tokens?.[provider];
  if (!payload) return null;
  try {
    return JSON.parse(decrypt(payload));
  } catch {
    return null;
  }
}

function clearToken(provider) {
  const raw = readRaw();
  if (raw.tokens) delete raw.tokens[provider];
  writeRaw(raw);
}

function connectionStatus() {
  return {
    google: Boolean(
      getToken("google")?.access_token || getToken("google")?.refresh_token
    ),
    microsoft: Boolean(
      getToken("microsoft")?.access_token || getToken("microsoft")?.refresh_token
    ),
    naver: Boolean(getToken("naver")?.email && getToken("naver")?.appPassword),
    windowsPeer: Boolean(rawWindowsPeer()),
    config: getPublicConfig(),
  };
}

function rawWindowsPeer() {
  const raw = readRaw();
  // Only true after user connects (or LAN peer is live)
  return raw.windowsPeerLinked === true;
}

function setWindowsPeerLinked(on) {
  const raw = readRaw();
  raw.windowsPeerLinked = !!on;
  writeRaw(raw);
}

module.exports = {
  getConfig,
  getPublicConfig,
  setConfig,
  saveToken,
  getToken,
  clearToken,
  connectionStatus,
  setWindowsPeerLinked,
  maskClientId,
};
