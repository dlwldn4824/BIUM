const { runOAuthCodeFlow, refreshToken } = require("../oauth");
const store = require("../store");

const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const SCOPES = [
  "offline_access",
  "User.Read",
  "Files.ReadWrite",
];

async function ensureAccessToken() {
  let token = store.getToken("microsoft");
  if (!token) throw new Error("Microsoft 계정이 연결되지 않았습니다.");

  const age = Date.now() - (token.obtained_at || 0);
  const expiresIn = (token.expires_in || 3600) * 1000;
  if (token.access_token && age < expiresIn - 60_000) return token.access_token;

  if (!token.refresh_token) throw new Error("Microsoft 재로그인이 필요합니다.");

  const cfg = store.getConfig();
  const next = await refreshToken({
    tokenUrl: TOKEN,
    body: {
      client_id: cfg.microsoftClientId,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
      scope: SCOPES.join(" "),
    },
  });
  token = {
    ...token,
    ...next,
    refresh_token: next.refresh_token || token.refresh_token,
  };
  store.saveToken("microsoft", token);
  return token.access_token;
}

async function connect() {
  const cfg = store.getConfig();
  const token = await runOAuthCodeFlow({
    authBaseUrl: AUTH,
    tokenUrl: TOKEN,
    clientId: cfg.microsoftClientId,
    scopes: SCOPES,
    extraAuthParams: {
      response_mode: "query",
    },
  });
  store.saveToken("microsoft", token);
  return { ok: true, provider: "microsoft" };
}

function disconnect() {
  store.clearToken("microsoft");
  return { ok: true };
}

async function graph(url, options = {}) {
  const access = await ensureAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${access}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || data.error?.code || `Graph ${res.status}`);
  }
  return data;
}

async function listCandidates({ max = 80 } = {}) {
  // Recent large files from OneDrive
  const data = await graph(
    "https://graph.microsoft.com/v1.0/me/drive/recent?$top=100&$select=id,name,size,lastModifiedDateTime,file,webUrl"
  );

  const files = [];
  for (const f of data.value || []) {
    if (!f.file) continue;
    const size = Number(f.size || 0);
    if (size < 5 * 1024 * 1024) continue;
    files.push({
      source: "onedrive",
      id: f.id,
      name: f.name,
      size,
      sizeLabel: null,
      room: "cloud",
      path: `onedrive://${f.id}/${f.name}`,
      modifiedTime: f.lastModifiedDateTime,
      md5: f.file?.hashes?.quickXorHash || null,
    });
    if (files.length >= max) break;
  }
  return files;
}

async function deleteFile(itemId) {
  await graph(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}`, {
    method: "DELETE",
  });
  return { ok: true };
}

async function aboutStorage() {
  try {
    const data = await graph("https://graph.microsoft.com/v1.0/me/drive?$select=quota,owner");
    return {
      email: data.owner?.user?.displayName,
      usage: Number(data.quota?.used || 0),
      limit: Number(data.quota?.total || 0),
    };
  } catch {
    return null;
  }
}

module.exports = {
  connect,
  disconnect,
  listCandidates,
  deleteFile,
  aboutStorage,
};
