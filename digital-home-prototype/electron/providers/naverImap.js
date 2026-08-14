/**
 * Naver Mail via IMAP — metadata + selective attachment MD5.
 * Never store the account password; only the app password (encrypted in store).
 * Cloud Outbound Mailer is NOT used (send-only SaaS, not personal mailbox).
 */
const crypto = require("crypto");
const tls = require("tls");
const { execFileSync } = require("child_process");
const store = require("../store");

const HOST = "imap.naver.com";
const PORT = 993;
const MIN_ATTACH_BYTES = 1 * 1024 * 1024; // 1MB+
const DEFAULT_OLDER_DAYS = 365;
const MAX_MAILS = 80;
const MAX_MD5 = 12;
let trustedCas = null;

function systemTrustedCas() {
  if (trustedCas) return trustedCas;
  trustedCas = [...tls.rootCertificates];
  if (process.platform !== "darwin") return trustedCas;
  try {
    const pem = execFileSync(
      "security",
      [
        "find-certificate",
        "-a",
        "-p",
        "/Library/Keychains/System.keychain",
      ],
      { encoding: "utf8", timeout: 5000, maxBuffer: 8 * 1024 * 1024 }
    );
    trustedCas.push(
      ...(pem.match(
        /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g
      ) || [])
    );
  } catch {
    /* Built-in Node roots still apply */
  }
  return trustedCas;
}

function getCredentials() {
  const token = store.getToken("naver");
  if (!token?.email || !token?.appPassword) return null;
  return {
    email: String(token.email).trim(),
    appPassword: String(token.appPassword),
  };
}

function saveCredentials({ email, appPassword }) {
  const e = String(email || "").trim();
  const p = String(appPassword || "").trim();
  if (!e || !p) throw new Error("네이버 이메일과 애플리케이션 비밀번호가 필요해요");
  if (!/@naver\.com$/i.test(e) && !e.includes("@")) {
    // allow other domains hosted on Naver IMAP only if user insists — still require @
  }
  store.saveToken("naver", { email: e, appPassword: p, saved_at: Date.now() });
  return { ok: true, email: e };
}

function disconnect() {
  store.clearToken("naver");
  return { ok: true };
}

function isConnected() {
  return !!getCredentials();
}

async function withClient(fn) {
  const creds = getCredentials();
  if (!creds) throw new Error("네이버 메일이 연결되지 않았어요");

  let ImapFlow;
  try {
    ({ ImapFlow } = require("imapflow"));
  } catch {
    throw new Error("imapflow 패키지가 없어요. npm install 후 다시 시도해 주세요");
  }

  const client = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: creds.email, pass: creds.appPassword },
    logger: false,
    // Match macOS trust without disabling certificate verification. This also
    // supports locally trusted TLS inspection certificates (for example Avast).
    tls: { rejectUnauthorized: true, ca: systemTrustedCas() },
  });

  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.logout();
    } catch {
      try {
        client.close();
      } catch {
        /* ignore */
      }
    }
  }
}

/** Quick auth check for settings / connectSpace. */
async function testConnection() {
  return withClient(async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const exists = client.mailbox?.exists || 0;
      let storageQuota = null;
      try {
        const quota = await client.getQuota("INBOX");
        const storage = quota && quota.storage;
        if (storage && Number(storage.limit) > 0) {
          storageQuota = {
            usedBytes: Number(storage.used ?? storage.usage) || 0,
            totalBytes: Number(storage.limit) || 0,
          };
        }
      } catch {
        /* Naver may not advertise the IMAP QUOTA extension */
      }
      return {
        ok: true,
        exists,
        email: getCredentials()?.email,
        storageQuota,
      };
    } finally {
      lock.release();
    }
  });
}

function walkParts(node, prefix = "", out = []) {
  if (!node) return out;
  const partId = prefix || "1";
  const disp = node.disposition || "";
  const isAttach =
    String(disp).toLowerCase() === "attachment" ||
    (node.dispositionParameters && node.dispositionParameters.filename) ||
    (node.parameters && node.parameters.name && node.type && node.type !== "text");
  const filename =
    (node.dispositionParameters && node.dispositionParameters.filename) ||
    (node.parameters && node.parameters.name) ||
    null;
  const size = Number(node.size || 0);
  if (filename && size >= MIN_ATTACH_BYTES) {
    out.push({
      part: partId,
      filename: String(filename),
      size,
      type: node.type || null,
      subtype: node.subtype || null,
    });
  }
  if (Array.isArray(node.childNodes)) {
    node.childNodes.forEach((child, i) => {
      const next = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      walkParts(child, next, out);
    });
  }
  return out;
}

/**
 * List old mails with large attachments (metadata only).
 * Optionally MD5 attachments that share size with local/Drive candidates.
 */
async function listAttachmentCandidates(options = {}) {
  const olderDays = options.olderThanDays ?? DEFAULT_OLDER_DAYS;
  const maxMails = options.maxMails ?? MAX_MAILS;
  const sizeHints = new Set(
    (options.sizeHints || []).map(Number).filter((n) => n > 0)
  );
  const before = new Date(Date.now() - olderDays * 86400_000);

  return withClient(async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    const attachments = [];
    let scanned = 0;
    try {
      let uids = [];
      try {
        uids = await client.search({ before }, { uid: true });
      } catch {
        uids = await client.search({ all: true }, { uid: true });
      }
      if (!Array.isArray(uids)) uids = [];
      // newest among old first
      uids = uids.slice(-Math.min(uids.length, maxMails * 3)).reverse();

      for (const uid of uids) {
        if (attachments.length >= maxMails) break;
        scanned += 1;
        let msg;
        try {
          msg = await client.fetchOne(
            String(uid),
            { uid: true, envelope: true, bodyStructure: true, size: true },
            { uid: true }
          );
        } catch {
          continue;
        }
        if (!msg?.bodyStructure) continue;
        const parts = walkParts(msg.bodyStructure);
        if (!parts.length) continue;
        const date = msg.envelope?.date
          ? new Date(msg.envelope.date).toISOString()
          : null;
        const subject = msg.envelope?.subject || "(제목 없음)";
        const from =
          msg.envelope?.from?.[0]?.address ||
          msg.envelope?.from?.[0]?.name ||
          "";

        for (const part of parts) {
          attachments.push({
            source: "naver-imap",
            uid: Number(uid),
            part: part.part,
            name: part.filename,
            size: part.size,
            path: `naver://${uid}/${part.part}/${encodeURIComponent(part.filename)}`,
            modified: date,
            room: "mail",
            subject,
            from,
            md5: null,
            hash: null,
            hashAlg: null,
            contentKey: null,
          });
        }
      }
    } finally {
      lock.release();
    }

    // Selective MD5: size overlap with local/Drive, else largest few
    const needMd5 = attachments
      .filter((a) => sizeHints.has(a.size) || a.size >= 5 * 1024 * 1024)
      .sort((a, b) => b.size - a.size)
      .slice(0, MAX_MD5);

    if (needMd5.length) {
      const lock2 = await client.getMailboxLock("INBOX");
      try {
        for (const a of needMd5) {
          try {
            const md5 = await hashPart(client, a.uid, a.part);
            if (md5) {
              a.md5 = md5;
              a.hash = md5;
              a.hashAlg = "md5";
              a.contentKey = `md5:${md5}`;
            }
          } catch {
            /* skip this attachment */
          }
        }
      } finally {
        lock2.release();
      }
    }

    // Soft size-only key for unhashed (weak) — orchestrator prefers md5 join
    for (const a of attachments) {
      if (!a.contentKey && a.size) {
        // leave null — demo/soft-bridge only in orchestrator when needed
      }
    }

    return {
      ok: true,
      demo: false,
      scanned,
      attachments,
      reclaimBytes: attachments.reduce((s, a) => s + (a.size || 0), 0),
    };
  });
}

async function hashPart(client, uid, part) {
  const { content } = await client.download(String(uid), part, { uid: true });
  const hash = crypto.createHash("md5");
  await new Promise((resolve, reject) => {
    content.on("data", (chunk) => hash.update(chunk));
    content.on("end", resolve);
    content.on("error", reject);
  });
  return hash.digest("hex");
}

module.exports = {
  HOST,
  PORT,
  getCredentials,
  saveCredentials,
  disconnect,
  isConnected,
  testConnection,
  listAttachmentCandidates,
};
