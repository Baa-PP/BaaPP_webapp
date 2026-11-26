import assert from "node:assert/strict";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");

const ALLOWED_VITE_ENV_KEYS = new Set(["VITE_API_BASE_URL"]);

const SECRET_PATTERNS = [
  { name: "AWS Access Key ID", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  {
    name: "Private Key Block",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  { name: "GitHub Token", regex: /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,}\b/g },
  { name: "GitHub Fine-Grained Token", regex: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "Stripe Live Key", regex: /\bsk_live_[A-Za-z0-9]{16,}\b/g },
  {
    name: "Hardcoded VITE Secret Identifier",
    regex: /\bVITE_(?:[A-Z0-9_]*?(?:SECRET|PASSWORD|PRIVATE_KEY|SIGNING_KEY|ACCESS_KEY|TOKEN))\b/g,
  },
];

function walkFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walkFiles(full));
    } else if (st.isFile()) {
      results.push(full);
    }
  }
  return results;
}

function scanSecrets(label, content) {
  for (const { name, regex } of SECRET_PATTERNS) {
    regex.lastIndex = 0;
    const hasMatch = regex.test(content);
    assert.equal(
      hasMatch,
      false,
      `Posible secreto detectado (${name}) en ${label}`
    );
  }
}

async function importApiModule(entryPoint, env = {}) {
  const bundled = await esbuild({
    entryPoints: [path.join(srcDir, "api", entryPoint)],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    define: { "import.meta.env": JSON.stringify(env) },
  });
  const source = Buffer.from(bundled.outputFiles[0].contents).toString("base64");
  return import(`data:text/javascript;base64,${source}`);
}

console.log("1. Auditando variables VITE_* y código fuente en src/...");
const srcFiles = walkFiles(srcDir);
for (const file of srcFiles) {
  const rel = path.relative(rootDir, file);
  const content = readFileSync(file, "utf8");
  scanSecrets(rel, content);

  const viteMatches = content.matchAll(
    /import\.meta\.env\??\.(VITE_[A-Z0-9_]+)/g
  );
  for (const m of viteMatches) {
    assert.ok(
      ALLOWED_VITE_ENV_KEYS.has(m[1]),
      `Variable VITE_* no permitida en ${rel}: ${m[1]}`
    );
  }
}

const envExamplePath = path.join(rootDir, ".env.example");
assert.ok(existsSync(envExamplePath), "Falta .env.example en la raíz.");
const envExample = readFileSync(envExamplePath, "utf8");
scanSecrets(".env.example", envExample);
const envLines = envExample
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));
for (const line of envLines) {
  const [key, ...rest] = line.split("=");
  const value = rest.join("=").trim();
  assert.ok(
    ALLOWED_VITE_ENV_KEYS.has(key),
    `Variable no permitida en .env.example: ${key}`
  );
  if (key === "VITE_API_BASE_URL") {
    assert.ok(
      value.startsWith("https://"),
      `.env.example debe usar HTTPS en VITE_API_BASE_URL, encontrado: ${value}`
    );
  }
}

console.log(
  "2. Validando política HTTPS y rechazo de credenciales en src/api/config.ts..."
);
const { validateApiBaseUrl } = await importApiModule("config.ts");

assert.equal(
  validateApiBaseUrl("https://du6aq4me7fp0q.cloudfront.net/api/v1/").isHttps,
  true
);
assert.equal(
  validateApiBaseUrl("https://du6aq4me7fp0q.cloudfront.net/api/v1/").error,
  null
);
assert.ok(
  validateApiBaseUrl("http://du6aq4me7fp0q.cloudfront.net/api/v1").error !== null,
  "Debe rechazar URLs remotas sobre HTTP sin TLS"
);
assert.ok(
  validateApiBaseUrl("https://user:pass@du6aq4me7fp0q.cloudfront.net/api/v1")
    .error !== null,
  "Debe rechazar credenciales embebidas en VITE_API_BASE_URL"
);
assert.equal(
  validateApiBaseUrl("http://localhost:5000/api/v1", "http:").error,
  null
);
assert.ok(
  validateApiBaseUrl("http://localhost:5000/api/v1", "https:").error !== null,
  "Debe bloquear Mixed Content cuando el portal corre en HTTPS y el API en HTTP"
);

console.log("3. Auditando el bundle generado por Vite en dist/...");
assert.ok(
  existsSync(distDir),
  "No existe dist/. Ejecuta `npm run build` antes de `npm run verify:security`."
);

const distFiles = walkFiles(distDir).filter((f) =>
  /\.(js|css|html)$/i.test(f)
);
assert.ok(distFiles.length > 0, "dist/ no contiene artefactos generados.");

const insecureCloudHttpRegex =
  /http:\/\/(?!localhost\b|127\.0\.0\.1\b|\[::1\]|www\.w3\.org\b)[^\s"'`<>]+/gi;

for (const file of distFiles) {
  const rel = path.relative(rootDir, file);
  const content = readFileSync(file, "utf8");
  scanSecrets(rel, content);

  const badUrls = content.match(insecureCloudHttpRegex) ?? [];
  const apiHttpUrls = badUrls.filter((u) =>
    /(?:cloudfront\.net|amazonaws\.com|amplifyapp\.com|\/api\/v1)/i.test(u)
  );
  assert.equal(
    apiHttpUrls.length,
    0,
    `Se encontraron URLs HTTP inseguras hacia backend/cloud en ${rel}: ${apiHttpUrls.join(", ")}`
  );
}

console.log(
  "4. Verificando en el cliente manejo de respuestas 403 y bloqueo de redirecciones en login/refresh (fetch simulado)..."
);

function createStorageMock() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => {
      store.set(k, String(v));
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
  };
}

const ownRanchId = "11111111-1111-4111-8111-111111111111";
const foreignRanchId = "99999999-9999-4999-8999-999999999999";
const mockApiBaseUrl = "https://api.test.baapp.local/api/v1";

const originalFetch = globalThis.fetch;
try {
  globalThis.sessionStorage = createStorageMock();
  globalThis.localStorage = createStorageMock();
  globalThis.window = { location: { protocol: "https:", hash: "#/inventario" } };

  let allowRefreshSuccess = false;
  const observedRequests = [];
  globalThis.fetch = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    const urlStr = String(url);
    observedRequests.push({
      url: urlStr,
      method: init.method ?? "GET",
      redirect: init.redirect,
      auth: headers.get("Authorization"),
      ranchId: headers.get("X-Active-Ranch-Id"),
    });

    if (urlStr.endsWith("/auth/login")) {
      assert.equal(
        init.redirect,
        "error",
        "POST /auth/login debe ejecutarse con redirect: 'error'"
      );
      const bodyText = typeof init.body === "string" ? init.body : "";
      if (bodyText.includes("force-redirect-throw")) {
        throw new TypeError("Failed to fetch");
      }
      if (bodyText.includes("force-redirected-flag")) {
        return {
          ok: true,
          status: 200,
          redirected: true,
          headers: new Headers(),
          json: async () => ({}),
        };
      }
      return new Response(null, {
        status: 307,
        headers: { Location: "http://evil.baapp.local/api/v1/auth/login" },
      });
    }

    if (urlStr.endsWith("/auth/refresh")) {
      assert.equal(
        init.redirect,
        "error",
        "POST /auth/refresh debe ejecutarse con redirect: 'error'"
      );
      if (allowRefreshSuccess) {
        return new Response(
          JSON.stringify({ accessToken: "refreshed-jwt-token" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return {
        ok: true,
        status: 200,
        redirected: true,
        headers: new Headers(),
        json: async () => ({ accessToken: "stolen-token" }),
      };
    }

    if (urlStr.endsWith("/animals-body-redirect")) {
      assert.equal(
        init.redirect,
        "error",
        "Petición con body debe usar redirect: 'error'"
      );
      return new Response(null, {
        status: 307,
        headers: { Location: "http://evil.baapp.local/api/v1/animals" },
      });
    }

    if (urlStr.endsWith("/animals-stale-token")) {
      assert.equal(
        init.redirect,
        "error",
        "Reintento por token más nuevo con body debe usar redirect: 'error'"
      );
      if (headers.get("Authorization") === "Bearer stale-token") {
        sessionStorage.setItem("jwt_token", "already-fresh-token");
        return new Response(JSON.stringify({ message: "Expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      assert.equal(headers.get("Authorization"), "Bearer already-fresh-token");
      return new Response(JSON.stringify({ retried: "stale" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.endsWith("/animals-concurrent-body")) {
      assert.equal(
        init.redirect,
        "error",
        "Petición concurrente con body y sus reintentos deben usar redirect: 'error'"
      );
      if (headers.get("Authorization") !== "Bearer refreshed-jwt-token") {
        return new Response(JSON.stringify({ message: "Expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ retried: "refreshed" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.endsWith("/animals-downgraded-url")) {
      return {
        ok: true,
        status: 200,
        url: "http://evil.baapp.local/api/v1/animals",
        headers: new Headers(),
        json: async () => ({ items: [] }),
      };
    }

    if (urlStr.endsWith("/animals-localhost-ok")) {
      return {
        ok: true,
        status: 200,
        url: "http://localhost:5000/api/v1/animals",
        headers: new Headers(),
        json: async () => ({ localOk: true }),
      };
    }

    if (urlStr.endsWith("/needs-refresh")) {
      return new Response(JSON.stringify({ message: "Expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.endsWith("/animals")) {
      if (headers.get("X-Active-Ranch-Id") !== ownRanchId) {
        return new Response(
          JSON.stringify({
            code: "RANCH_ACCESS_DENIED",
            message: "El usuario autenticado no tiene acceso al rancho activo.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ items: [], totalElements: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (urlStr.endsWith("/analytics/overview")) {
      return new Response(
        JSON.stringify({ code: "INSUFFICIENT_PERMISSION" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ code: "FORBIDDEN" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  };

  const { apiFetch, onForbiddenError, postAuthEndpoint } = await importApiModule(
    "client.ts",
    {
      VITE_API_BASE_URL: mockApiBaseUrl,
    }
  );

  sessionStorage.setItem("jwt_token", "owner-jwt-token");
  const forbiddenEvents = [];
  const unsub = onForbiddenError((ev) => forbiddenEvents.push(ev));

  // Caso A: respuesta simulada 200 para el rancho propio.
  const okRes = await apiFetch("/animals", { ranchId: ownRanchId });
  assert.deepEqual(okRes, { items: [], totalElements: 0 });
  assert.equal(forbiddenEvents.length, 0);
  assert.equal(observedRequests[0].url, `${mockApiBaseUrl}/animals`);
  assert.equal(observedRequests[0].auth, "Bearer owner-jwt-token");
  assert.equal(observedRequests[0].ranchId, ownRanchId);

  // Caso B: el cliente publica el aviso de acceso denegado al recibir el 403 simulado.
  await assert.rejects(
    () => apiFetch("/animals", { ranchId: foreignRanchId }),
    (err) =>
      err?.status === 403 &&
      err?.code === "RANCH_ACCESS_DENIED" &&
      err?.message === "El usuario autenticado no tiene acceso al rancho activo."
  );
  assert.equal(observedRequests[1].ranchId, foreignRanchId);
  assert.equal(forbiddenEvents.length, 1);
  assert.equal(forbiddenEvents[0].code, "RANCH_ACCESS_DENIED");
  assert.equal(forbiddenEvents[0].ranchId, foreignRanchId);
  assert.equal(forbiddenEvents[0].path, "/animals");

  // Caso C: 403 INSUFFICIENT_PERMISSION sin campo message usa respaldo en español
  await assert.rejects(
    () => apiFetch("/analytics/overview", { ranchId: ownRanchId }),
    (err) =>
      err?.status === 403 &&
      err?.code === "INSUFFICIENT_PERMISSION" &&
      err?.message.includes("No cuentas con los permisos necesarios")
  );
  assert.equal(forbiddenEvents.length, 2);

  // Caso D: 403 FORBIDDEN genérico sin campo message usa respaldo en español
  await assert.rejects(
    () => apiFetch("/association/audits", { ranchId: ownRanchId }),
    (err) =>
      err?.status === 403 &&
      err?.code === "FORBIDDEN" &&
      err?.message.includes("Acceso denegado (403)")
  );
  assert.equal(forbiddenEvents.length, 3);
  unsub();

  // Caso E: login rechaza error de transporte/redirección de fetch (redirect: "error")
  await assert.rejects(
    () =>
      postAuthEndpoint("/auth/login", {
        username: "force-redirect-throw",
        password: "secret",
      }),
    (err) => err?.status === 0 && err?.code === "AUTH_TRANSPORT_ERROR"
  );

  // Caso F: login rechaza respuesta marcada como redirected o HTTP 3xx
  await assert.rejects(
    () =>
      postAuthEndpoint("/auth/login", {
        username: "force-redirected-flag",
        password: "secret",
      }),
    (err) => err?.status === 0 && err?.code === "REDIRECT_BLOCKED"
  );
  await assert.rejects(
    () =>
      postAuthEndpoint("/auth/login", {
        username: "status-307",
        password: "secret",
      }),
    (err) => err?.status === 0 && err?.code === "REDIRECT_BLOCKED"
  );

  // Caso G: refreshSession ante 401 usa redirect: "error" y rechaza respuestas redirigidas
  sessionStorage.setItem("jwt_refresh_token", "owner-refresh-token");
  await assert.rejects(
    () => apiFetch("/needs-refresh", { ranchId: ownRanchId }),
    (err) => err?.status === 0 && err?.code === "REDIRECT_BLOCKED"
  );
  assert.equal(observedRequests.at(-1).url, `${mockApiBaseUrl}/auth/refresh`);
  assert.equal(observedRequests.at(-1).redirect, "error");

  // Caso H: las 4 rutas fetch de apiFetch bloquean redirecciones en peticiones con body
  await assert.rejects(
    () =>
      apiFetch("/animals-body-redirect", {
        method: "POST",
        body: JSON.stringify({ tag: "01" }),
        ranchId: ownRanchId,
      }),
    (err) => err?.status === 0 && err?.code === "REDIRECT_BLOCKED"
  );

  sessionStorage.setItem("jwt_token", "stale-token");
  const staleRetryRes = await apiFetch("/animals-stale-token", {
    method: "POST",
    body: JSON.stringify({ tag: "02" }),
    ranchId: ownRanchId,
  });
  assert.deepEqual(staleRetryRes, { retried: "stale" });

  allowRefreshSuccess = true;
  sessionStorage.setItem("jwt_token", "expired-jwt-token");
  sessionStorage.setItem("jwt_refresh_token", "owner-refresh-token");
  const refreshCountBefore = observedRequests.filter((r) =>
    r.url.endsWith("/auth/refresh")
  ).length;
  const [leaderRes, queuedRes] = await Promise.all([
    apiFetch("/animals-concurrent-body", {
      method: "POST",
      body: JSON.stringify({ tag: "03" }),
      ranchId: ownRanchId,
    }),
    apiFetch("/animals-concurrent-body", {
      method: "POST",
      body: JSON.stringify({ tag: "04" }),
      ranchId: ownRanchId,
    }),
  ]);
  assert.deepEqual(leaderRes, { retried: "refreshed" });
  assert.deepEqual(queuedRes, { retried: "refreshed" });
  const refreshCountAfter = observedRequests.filter((r) =>
    r.url.endsWith("/auth/refresh")
  ).length;
  assert.equal(refreshCountAfter - refreshCountBefore, 1);

  // Caso I: rechaza URL final no-HTTPS y preserva excepción de localhost HTTP en desarrollo
  await assert.rejects(
    () => apiFetch("/animals-downgraded-url", { ranchId: ownRanchId }),
    (err) => err?.status === 0 && err?.code === "INSECURE_TRANSPORT"
  );

  globalThis.window = { location: { protocol: "http:", hash: "#/inventario" } };
  const localClient = await importApiModule("client.ts", {
    VITE_API_BASE_URL: "http://localhost:5000/api/v1",
  });
  const localGet = await localClient.apiFetch("/animals-localhost-ok", {
    ranchId: ownRanchId,
  });
  assert.deepEqual(localGet, { localOk: true });
  const localPost = await localClient.apiFetch("/animals-localhost-ok", {
    method: "POST",
    body: JSON.stringify({ local: true }),
    ranchId: ownRanchId,
  });
  assert.deepEqual(localPost, { localOk: true });
  assert.equal(observedRequests.at(-1).redirect, "error");
} finally {
  globalThis.fetch = originalFetch;
}

console.log(
  `WEB-026: auditoría de ${srcFiles.length} archivos fuente y ${distFiles.length} artefactos del bundle superada; política de URL base, bloqueo de redirecciones auth/body (incluyendo reintentos y excepción localhost) y manejo cliente de 403 simulado verificados.`
);
console.log(
  "El rechazo real del backend BE-002 y el aviso en pantalla se comprueban por separado (tickets/WEB-026.md y README.md)."
);
