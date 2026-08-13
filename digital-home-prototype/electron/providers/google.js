const { runOAuthCodeFlow, refreshToken } = require("../oauth");
const store = require("../store");

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
// Metadata + checksum only — we never download file bodies for hashing.
const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
];

/** Avg size guess when Gmail only returns resultSizeEstimate */
const AVG_SPAM_BYTES = 180_000;
const AVG_UNREAD_BYTES = 90_000;

async function ensureAccessToken() {
  let token = store.getToken("google");
  if (!token) throw new Error("Google 계정이 연결되지 않았습니다.");

  const age = Date.now() - (token.obtained_at || 0);
  const expiresIn = (token.expires_in || 3600) * 1000;
  if (token.access_token && age < expiresIn - 60_000) return token.access_token;

  if (!token.refresh_token) throw new Error("Google 재로그인이 필요합니다.");

  const cfg = store.getConfig();
  const next = await refreshToken({
    tokenUrl: TOKEN,
    body: {
      client_id: cfg.googleClientId,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    },
  });
  token = {
    ...token,
    ...next,
    refresh_token: next.refresh_token || token.refresh_token,
  };
  store.saveToken("google", token);
  return token.access_token;
}

async function connect() {
  const cfg = store.getConfig();
  const token = await runOAuthCodeFlow({
    authBaseUrl: AUTH,
    tokenUrl: TOKEN,
    clientId: cfg.googleClientId,
    scopes: SCOPES,
    extraAuthParams: {
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    },
  });
  store.saveToken("google", token);
  return { ok: true, provider: "google" };
}

function disconnect() {
  store.clearToken("google");
  return { ok: true };
}

async function gfetch(url, options = {}) {
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
    throw new Error(data.error?.message || data.error || `Google API ${res.status}`);
  }
  return data;
}

async function listDriveCandidates({ max = 80 } = {}) {
  // Large / old-ish files as cleanup candidates
  const q = "trashed=false and mimeType!='application/vnd.google-apps.folder'";
  const fields =
    "nextPageToken,files(id,name,size,modifiedTime,md5Checksum,mimeType,webViewLink)";
  let pageToken = "";
  const files = [];

  while (files.length < max) {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", q);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("fields", fields);
    url.searchParams.set("orderBy", "modifiedTime desc");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const data = await gfetch(url.toString());
    for (const f of data.files || []) {
      const size = Number(f.size || 0);
      if (size < 5 * 1024 * 1024) continue; // 5MB+
      files.push({
        source: "gdrive",
        id: f.id,
        name: f.name,
        size,
        sizeLabel: null,
        room: "cloud",
        path: `gdrive://${f.id}/${f.name}`,
        modifiedTime: f.modifiedTime,
        md5: f.md5Checksum || null,
        mimeType: f.mimeType,
      });
      if (files.length >= max) break;
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }

  return files;
}

async function listGmailAttachmentCandidates({ max = 40 } = {}) {
  // Older emails with attachments
  const list = await gfetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=" +
      encodeURIComponent("has:attachment older_than:365d larger:5M") +
      `&maxResults=${Math.min(max, 50)}`
  );

  const out = [];
  for (const m of list.messages || []) {
    if (out.length >= max) break;
    const full = await gfetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject`
    );
    const subject =
      (full.payload?.headers || []).find((h) => h.name === "Subject")?.value ||
      "(제목 없음)";
    const size = Number(full.sizeEstimate || 0);
    out.push({
      source: "gmail",
      id: m.id,
      name: subject,
      size,
      sizeLabel: null,
      room: "mail",
      path: `gmail://${m.id}`,
      modifiedTime: new Date(Number(full.internalDate || Date.now())).toISOString(),
    });
  }
  return out;
}

async function estimateQuery(q) {
  const data = await gfetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=" +
      encodeURIComponent(q) +
      "&maxResults=1"
  );
  return Number(data.resultSizeEstimate || 0);
}

/**
 * Recommend emptying spam + long-unread mail when Gmail is connected.
 */
async function listMailCleanupRecommendations() {
  const spamCount = await estimateQuery("in:spam");
  const unreadCount = await estimateQuery("is:unread older_than:90d -in:spam");
  const spamBytes = spamCount * AVG_SPAM_BYTES;
  const unreadBytes = unreadCount * AVG_UNREAD_BYTES;
  const groups = [];

  if (spamCount > 0) {
    groups.push({
      id: "spam",
      kind: "spam",
      title: "스팸함",
      reason: "스팸함이 쌓여 있어요. 비우면 메일함 공간을 바로 확보할 수 있어요.",
      count: spamCount,
      reclaimBytes: spamBytes,
      actionLabel: "스팸함 비우기",
      recommended: true,
    });
  }
  if (unreadCount > 0) {
    groups.push({
      id: "old-unread",
      kind: "old-unread",
      title: "오래된 안 읽은 메일",
      reason: "90일 이상 안 읽은 메일이에요. 필요 없다면 정리해 보세요.",
      count: unreadCount,
      reclaimBytes: unreadBytes,
      actionLabel: "오래된 안읽음 정리",
      recommended: true,
    });
  }

  return {
    ok: true,
    demo: false,
    source: "gmail",
    reclaimBytes: groups.reduce((s, g) => s + g.reclaimBytes, 0),
    groups,
  };
}

async function deleteDriveFile(fileId) {
  await gfetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
  });
  return { ok: true };
}

async function trashGmailMessage(messageId) {
  await gfetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`,
    { method: "POST" }
  );
  return { ok: true };
}

async function aboutStorage() {
  try {
    const data = await gfetch(
      "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user"
    );
    return {
      email: data.user?.emailAddress,
      usage: Number(data.storageQuota?.usage || 0),
      limit: Number(data.storageQuota?.limit || 0),
    };
  } catch {
    return null;
  }
}

module.exports = {
  connect,
  disconnect,
  listDriveCandidates,
  listGmailAttachmentCandidates,
  listMailCleanupRecommendations,
  deleteDriveFile,
  trashGmailMessage,
  aboutStorage,
};
