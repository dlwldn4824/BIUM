const { runOAuthCodeFlow, refreshToken } = require("../oauth");
const store = require("../store");

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
// drive = list + md5Checksum + trash. Re-consent needed after scope change.
// File bodies are never uploaded to BIUM servers — only metadata/checksums.
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.readonly",
  "openid",
  "email",
];

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Avg size guess when Gmail only returns resultSizeEstimate */
const AVG_SPAM_BYTES = 180_000;
const AVG_UNREAD_BYTES = 90_000;

function tokenHasGmailScope(token) {
  const scope = String(token?.scope || "");
  if (!scope) return false;
  return scope.split(/\s+/).includes(GMAIL_SCOPE);
}

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
      client_secret: cfg.googleClientSecret,
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
  if (!cfg.googleClientSecret) {
    throw new Error("Google Desktop OAuth Client Secret이 필요합니다.");
  }
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
    extraTokenParams: {
      client_secret: cfg.googleClientSecret,
    },
  });
  store.saveToken("google", token);
  return { ok: true, provider: "google", scope: token.scope || "" };
}

/** Lightweight Gmail probe — fails if scope missing or Gmail API disabled. */
async function probeGmail() {
  const data = await gfetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile"
  );
  return {
    email: data.emailAddress || null,
    messagesTotal: Number(data.messagesTotal || 0),
    threadsTotal: Number(data.threadsTotal || 0),
  };
}

/**
 * Ensure Google token can call Gmail. Reuses session when scope already works;
 * otherwise opens OAuth (Drive + Gmail).
 */
async function ensureGmailAccess() {
  const existing = store.getToken("google");
  if (existing?.access_token || existing?.refresh_token) {
    // Probe when scope unknown or already includes Gmail
    if (tokenHasGmailScope(existing) || !existing.scope) {
      try {
        const profile = await probeGmail();
        return { ok: true, reused: true, email: profile.email };
      } catch (err) {
        const msg = String(err.message || err);
        // API not enabled — re-login will not help
        if (/has not been used|accessNotConfigured|disabled/i.test(msg)) {
          throw err;
        }
        // Missing / expired scope → force consent below
        if (
          !/insufficient|ACCESS_TOKEN_SCOPE|403|401|Invalid Credentials|UNAUTHENTICATED/i.test(
            msg
          )
        ) {
          throw err;
        }
      }
    }
  }
  await connect();
  const profile = await probeGmail();
  return { ok: true, reused: false, email: profile.email };
}

function friendlyGmailError(err) {
  const msg = String(err?.message || err || "");
  if (/has not been used|disabled|accessNotConfigured/i.test(msg)) {
    return "Google Cloud에서 Gmail API를 사용 설정한 뒤 다시 연결해 주세요";
  }
  if (/insufficient|ACCESS_TOKEN_SCOPE|invalid_scope/i.test(msg)) {
    return "Gmail 읽기 권한이 없어요. 로그인 창에서 Gmail 접근을 허용해 주세요";
  }
  if (/Client ID|client_id/i.test(msg)) {
    return "설정에서 Google Client ID를 먼저 넣어 주세요";
  }
  if (/client_secret|Client Secret/i.test(msg)) {
    return "설정에서 데스크톱 OAuth Client Secret도 입력해 주세요";
  }
  return msg || "Gmail에 연결하지 못했어요";
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
 * Empty groups = real mailbox is clean (never invent demo counts here).
 */
async function listMailCleanupRecommendations() {
  let email = null;
  try {
    const profile = await probeGmail();
    email = profile.email;
  } catch {
    /* estimateQuery will surface the real error */
  }

  const [spamCount, unreadCount] = await Promise.all([
    estimateQuery("in:spam"),
    estimateQuery("is:unread older_than:90d -in:spam"),
  ]);
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
    email,
    spamCount,
    unreadCount,
    reclaimBytes: groups.reduce((s, g) => s + g.reclaimBytes, 0),
    groups,
  };
}

/** Soft-delete to Drive trash (recoverable). */
async function trashDriveFile(fileId) {
  const id = encodeURIComponent(String(fileId || ""));
  if (!id) throw new Error("Drive 파일 ID가 없어요");
  await gfetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  return { ok: true, fileId: String(fileId) };
}

/** Permanent delete — prefer trashDriveFile for user-facing keep-one. */
async function deleteDriveFile(fileId) {
  const id = encodeURIComponent(String(fileId || ""));
  await gfetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
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
  const data = await gfetch(
    "https://www.googleapis.com/drive/v3/about?fields=storageQuota,user"
  );
  return {
    email: data.user?.emailAddress,
    usage: Number(data.storageQuota?.usage || 0),
    limit: Number(data.storageQuota?.limit || 0),
  };
}

module.exports = {
  connect,
  disconnect,
  ensureGmailAccess,
  probeGmail,
  friendlyGmailError,
  listDriveCandidates,
  listGmailAttachmentCandidates,
  listMailCleanupRecommendations,
  trashDriveFile,
  deleteDriveFile,
  trashGmailMessage,
  aboutStorage,
  SCOPES,
  GMAIL_SCOPE,
};
