const http = require("http");
const crypto = require("crypto");
const { shell } = require("electron");

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function startLoopbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, port, redirectUri: `http://127.0.0.1:${port}/callback` });
    });
    server.on("error", reject);
  });
}

function waitForCode(server, expectedState, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("로그인 시간이 초과되었습니다."));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      server.close();
      server.removeAllListeners("request");
    }

    server.on("request", (req, res) => {
      try {
        const url = new URL(req.url, "http://127.0.0.1");
        if (url.pathname !== "/callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }

        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        if (error) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h2>로그인 실패</h2><p>${error}</p><p>창을 닫고 앱으로 돌아가세요.</p>`);
          cleanup();
          reject(new Error(error));
          return;
        }

        if (!code || state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h2>잘못된 콜백</h2>");
          cleanup();
          reject(new Error("OAuth state mismatch"));
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<h2>연결 완료</h2><p>BIUM으로 돌아가세요. 이 창은 닫아도 됩니다.</p>"
        );
        cleanup();
        resolve(code);
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  });
}

async function exchangeCode({ tokenUrl, body }) {
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.error || "토큰 교환 실패");
  }
  return {
    ...data,
    obtained_at: Date.now(),
  };
}

async function refreshToken({ tokenUrl, body }) {
  return exchangeCode({ tokenUrl, body });
}

async function runOAuthCodeFlow({
  authBaseUrl,
  tokenUrl,
  clientId,
  scopes,
  extraAuthParams = {},
  extraTokenParams = {},
}) {
  if (!clientId) {
    throw new Error("Client ID가 필요합니다. 설정에서 입력하세요.");
  }

  const { server, redirectUri } = await startLoopbackServer();
  const state = b64url(crypto.randomBytes(16));
  const { verifier, challenge } = pkce();

  const authUrl = new URL(authBaseUrl);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  for (const [k, v] of Object.entries(extraAuthParams)) {
    authUrl.searchParams.set(k, v);
  }

  const codePromise = waitForCode(server, state);
  await shell.openExternal(authUrl.toString());
  const code = await codePromise;

  return exchangeCode({
    tokenUrl,
    body: {
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      ...extraTokenParams,
    },
  });
}

module.exports = {
  runOAuthCodeFlow,
  refreshToken,
  pkce,
};
