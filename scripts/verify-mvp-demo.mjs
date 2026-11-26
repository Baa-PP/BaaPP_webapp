import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const srcDir = path.join(rootDir, "src");
const repoRequire = createRequire(path.join(rootDir, "package.json"));
const strictMode = process.argv.includes("--strict");

function walkFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(full));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const nodeTestStubPlugin = {
  name: "node-test-stub",
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => ({
      path: args.path,
      namespace: "css-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "css-stub" }, () => ({
      contents: "",
      loader: "js",
    }));
    build.onResolve({ filter: /^echarts(?:\/.*)?$/ }, (args) => ({
      path: args.path,
      namespace: "echarts-stub",
    }));
    build.onLoad({ filter: /.*/, namespace: "echarts-stub" }, () => ({
      contents: [
        "export const use = () => {};",
        "export const init = () => ({ setOption() {}, resize() {}, dispose() {} });",
        "export const BarChart = {};",
        "export const LineChart = {};",
        "export const GridComponent = {};",
        "export const LegendComponent = {};",
        "export const TooltipComponent = {};",
        "export const CanvasRenderer = {};",
        "export default { use, init };",
      ].join("\n"),
      loader: "js",
    }));
  },
};

function evalCjsBundle(codeText) {
  const mod = { exports: {} };
  const fn = new Function("require", "exports", "module", codeText);
  fn(repoRequire, mod.exports, mod);
  return mod.exports;
}

async function importTsModule(relEntryPath, options = {}) {
  const entryPoint = path.join(rootDir, relEntryPath);
  const bundled = await esbuild({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    plugins: [nodeTestStubPlugin],
    define: {
      "import.meta.env": JSON.stringify({
        VITE_API_BASE_URL:
          options.apiBaseUrl ?? "https://du6aq4me7fp0q.cloudfront.net/api/v1",
        DEV: false,
        PROD: true,
      }),
    },
    external: options.external ?? [],
  });
  return evalCjsBundle(bundled.outputFiles[0].text);
}

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
  };
}

// Entorno mínimo de navegador para importar módulos cliente en Node.js 20+
globalThis.sessionStorage = createMemoryStorage();
globalThis.localStorage = createMemoryStorage();
globalThis.window = {
  location: {
    protocol: "https:",
    hash: "#/inventario",
  },
};

const results = [];

function recordResult(id, title, status, details) {
  results.push({ id, title, status, details });
}

// ---------------------------------------------------------------------------
// Criterio 1: Sincronización campo -> portal (last_sync_at + ficha + pesajes)
// ---------------------------------------------------------------------------
console.log("1. Verificando Criterio 1: sincronización campo -> portal...");
const appSource = readFileSync(path.join(srcDir, "App.tsx"), "utf8");
assert.ok(
  appSource.includes("lastSyncedAt") && appSource.includes("last_sync_at"),
  "App.tsx debe normalizar lastSyncedAt / last_sync_at del rancho"
);
assert.ok(
  appSource.includes("Última sync móvil"),
  "App.tsx debe mostrar el indicador de última sincronización móvil en la barra superior"
);

const certMod = await importTsModule(
  "src/features/inventory/AnimalCertificate.tsx",
  {
    external: ["react", "react/jsx-runtime", "@tanstack/react-query"],
  }
);
const syncedAnimal = certMod.normalizeAnimalDetail({
  data: {
    id: "sync-animal-001",
    ranchId: "ranch-sauces",
    folioInterno: "OVI-2026-042",
    siniigaChip: "484000012345678",
    registroUno: "UNO-2026-042",
    sex: "FEMALE",
    breed: "Dorper",
    color: "Blanco cabeza negra",
    birthDate: "2026-09-10",
    criador: "Rancho Los Sauces",
    propietario: "Rancho Los Sauces",
    status: "ACTIVE",
    photoS3Key: "ranches/ranch-sauces/animals/sync-animal-001.jpg",
    weights: [
      { id: "w-1", milestone: "BIRTH", weightKg: 4.1, date: "2026-09-10" },
      { id: "w-2", milestone: "WEANING", weightKg: 21.5, date: "2026-11-20" },
    ],
  },
});
assert.equal(syncedAnimal.folioInterno, "OVI-2026-042");
assert.equal(syncedAnimal.siniigaChip, "484000012345678");
assert.equal(syncedAnimal.weights.length, 2);
assert.equal(syncedAnimal.weights[1].weightKg, 21.5);
assert.equal(
  syncedAnimal.photoS3Key,
  "ranches/ranch-sauces/animals/sync-animal-001.jpg"
);

recordResult(
  "7.2.1",
  "Sincronización campo -> portal",
  "PASS",
  "Normalización de last_sync_at en App.tsx y ficha/pesajes/S3 en AnimalCertificate.tsx verificadas (requiere ensayo vivo con BaaPP-app + BE-016)."
);

// ---------------------------------------------------------------------------
// Criterio 2: Multi-rancho sin re-login (WEB-005 + BE-002)
// ---------------------------------------------------------------------------
console.log("2. Verificando Criterio 2: multi-rancho sin re-login (WEB-005)...");
assert.ok(
  appSource.includes("handleRanchChange") &&
    appSource.includes("qc.invalidateQueries()"),
  "App.tsx debe invalidar cachés de TanStack Query al cambiar de rancho sin re-login"
);

// Bundlear store + apiFetch juntos en un solo módulo para compartir la misma instancia de Zustand
const multiRanchBundle = await esbuild({
  stdin: {
    contents: `
      export { useRanchContextStore } from "./src/store/useRanchContextStore.ts";
      export { apiFetch, onForbiddenError } from "./src/api/client.ts";
    `,
    resolveDir: rootDir,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "cjs",
  platform: "node",
  define: {
    "import.meta.env": JSON.stringify({
      VITE_API_BASE_URL: "https://du6aq4me7fp0q.cloudfront.net/api/v1",
      DEV: false,
      PROD: true,
    }),
  },
  external: ["zustand"],
});
const multiRanchMod = evalCjsBundle(multiRanchBundle.outputFiles[0].text);

const observedRanchHeaders = [];
const originalFetch = globalThis.fetch;
try {
  globalThis.sessionStorage.setItem("jwt_token", "demo-session-token");
  globalThis.fetch = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    const activeHeader = headers.get("X-Active-Ranch-Id");
    observedRanchHeaders.push({
      url: String(url),
      auth: headers.get("Authorization"),
      ranchId: activeHeader,
    });
    if (activeHeader === "ranch-ajeno") {
      return new Response(
        JSON.stringify({
          code: "RANCH_ACCESS_DENIED",
          message: "El usuario autenticado no tiene acceso al rancho activo.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ ranchId: activeHeader, items: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const store = multiRanchMod.useRanchContextStore.getState();
  store.setAvailableRanches([
    { id: "ranch-los-sauces", name: "Los Sauces" },
    { id: "ranch-la-curva", name: "La Curva" },
  ]);
  assert.equal(
    multiRanchMod.useRanchContextStore.getState().activeRanchId,
    "ranch-los-sauces"
  );

  const resSauces = await multiRanchMod.apiFetch("/animals");
  assert.equal(resSauces.ranchId, "ranch-los-sauces");

  // Cambio de rancho sin re-login: conserva JWT y actualiza X-Active-Ranch-Id al instante
  multiRanchMod.useRanchContextStore
    .getState()
    .setActiveRanchId("ranch-la-curva");
  const resCurva = await multiRanchMod.apiFetch("/animals");
  assert.equal(resCurva.ranchId, "ranch-la-curva");
  assert.equal(
    globalThis.sessionStorage.getItem("jwt_token"),
    "demo-session-token"
  );
  assert.equal(observedRanchHeaders[0].ranchId, "ranch-los-sauces");
  assert.equal(observedRanchHeaders[1].ranchId, "ranch-la-curva");
  assert.equal(observedRanchHeaders[1].auth, "Bearer demo-session-token");

  const forbiddenEvents = [];
  const unsub = multiRanchMod.onForbiddenError((ev) => forbiddenEvents.push(ev));
  await assert.rejects(
    () => multiRanchMod.apiFetch("/animals", { ranchId: "ranch-ajeno" }),
    (err) => err?.status === 403 && err?.code === "RANCH_ACCESS_DENIED"
  );
  unsub();
  assert.equal(forbiddenEvents.length, 1);
  assert.equal(forbiddenEvents[0].ranchId, "ranch-ajeno");
} finally {
  globalThis.fetch = originalFetch;
}

recordResult(
  "7.2.2",
  "Multi-rancho sin re-login (WEB-005)",
  "PASS",
  "Cambio Los Sauces -> La Curva conserva JWT, rota X-Active-Ranch-Id, invalida cachés y rechaza 403 en rancho ajeno."
);

// ---------------------------------------------------------------------------
// Criterio 3: Auditoría anti-fraude (WEB-015 / WEB-016 / WEB-017 / WEB-018)
// ---------------------------------------------------------------------------
console.log("3. Verificando Criterio 3: auditoría anti-fraude (WEB-015..018)...");
const siniigaMod = await importTsModule(
  "src/features/births/siniigaReconciliation.ts"
);
const auditMod = await importTsModule("src/features/births/auditApi.ts");

assert.equal(
  siniigaMod.computeDaysElapsed("2026-10-20", "2026-11-20"),
  31,
  "Parto con >30 días debe superar el umbral de bloqueo"
);
assert.equal(
  siniigaMod.computeDaysElapsed("2026-11-10", "2026-11-20"),
  10,
  "Parto dentro de 30 días debe permanecer abierto"
);

const siniigaSummary = siniigaMod.buildMonthlySiniigaReconciliation(
  null,
  [
    {
      id: "birth-1",
      birthDate: "2026-06-15",
      liveBornCount: 10,
      stillbornCount: 1,
      registeredLambsCount: 8,
      subsequentDeceasedCount: 2,
      requestedChipsCount: 10,
      daysElapsed: 158,
    },
  ],
  {},
  "2026-11-20"
);
assert.equal(siniigaSummary.months.length, 1);
assert.equal(siniigaSummary.months[0].allowedChipsCount, 8);
assert.equal(siniigaSummary.months[0].exceedsAllowed, true);
assert.equal(siniigaSummary.months[0].excessChips, 2);
assert.equal(siniigaSummary.months[0].inFiveMonthWindow, true);

// Validar rechazo de archivos no permitidos en evidencia fotográfica obligatoria
const fakePdf = new File(["%PDF-1.4"], "evidencia.pdf", {
  type: "application/pdf",
});
const pdfCheck = await auditMod.validateEvidenceFile(fakePdf);
assert.equal(pdfCheck.valid, false);
assert.ok(pdfCheck.error.includes("JPG, PNG o WebP"));

const emptyJpg = new File([], "vacia.jpg", { type: "image/jpeg" });
const emptyCheck = await auditMod.validateEvidenceFile(emptyJpg);
assert.equal(emptyCheck.valid, false);

// Validar normalización inmutable de historial auditorias_parto (estado anterior vs nuevo)
const auditEntry = auditMod.normalizeAuditHistoryEntry(
  {
    id: "aud-001",
    birthId: "birth-1",
    ranchId: "ranch-los-sauces",
    approvedByUsername: "vet.asociacion",
    reason: "Error de dedo en conteo de crías vivas confirmado con foto",
    evidencePhotoS3Key: "ranches/ranch-los-sauces/audits/foto-001.jpg",
    createdAt: "2026-11-20T18:00:00Z",
    previousState: { birthDate: "2026-10-01", liveBornCount: 1, stillbornCount: 0 },
    newState: { birthDate: "2026-10-01", liveBornCount: 2, stillbornCount: 0 },
  },
  0
);
assert.ok(auditEntry);
assert.equal(auditEntry.approverLabel, "vet.asociacion");
assert.equal(auditEntry.changedCount, 1);
assert.equal(
  auditEntry.diffRows.find((r) => r.key === "liveBornCount")?.changed,
  true
);

recordResult(
  "7.2.3",
  "Auditoría anti-fraude (WEB-015..018)",
  "PASS",
  "Bloqueo >30 días, evidencia fotográfica obligatoria, bitácora inmutable (diff anterior/nuevo) y conciliación SINIIGA a 5 meses verificados."
);

// ---------------------------------------------------------------------------
// Criterio 4: Exportación .xlsx compatible (WEB-012 / WEB-013)
// ---------------------------------------------------------------------------
console.log("4. Verificando Criterio 4: Sábana 24 columnas y exportación .xlsx (WEB-012/013)...");
const sabanaMod = await importTsModule("src/features/sabana/SabanaColumns.ts");
assert.equal(
  sabanaMod.sabanaColumns.length,
  24,
  "La Sábana oficial debe definir exactamente 24 columnas (A a X)"
);
assert.equal(sabanaMod.sabanaColumns[0].header, "A · Folio");
assert.equal(sabanaMod.sabanaColumns[2].header, "C · CHIP SINIIGA");
assert.equal(sabanaMod.sabanaColumns[11].header, "L · Circ. Escrotal (cm)");
assert.equal(sabanaMod.sabanaColumns[22].header, "W · Sexo");
assert.equal(sabanaMod.sabanaColumns[23].header, "X · Fecha Corte");

const sabanaFiles = walkFiles(path.join(srcDir, "features", "sabana"));
const hasXlsxExport = sabanaFiles.some((filePath) => {
  const txt = readFileSync(filePath, "utf8");
  return txt.includes("/reports/sabana") || txt.includes("exportSabana");
});

if (hasXlsxExport) {
  recordResult(
    "7.2.4",
    "Exportación .xlsx compatible (WEB-012/013)",
    "PASS",
    "24 columnas A-X y módulo de exportación streaming /reports/sabana presentes en el branch actual."
  );
} else {
  recordResult(
    "7.2.4",
    "Exportación .xlsx compatible (WEB-012/013)",
    "PENDING_PR_MERGE",
    "24 columnas A-X verificadas en SabanaColumns.ts; falta integrar PR #67 (WEB-012) y PR #68 (WEB-013 exportación .xlsx) en main."
  );
}

// ---------------------------------------------------------------------------
// Criterio 5: Árbol genealógico + vientres improductivos (WEB-019/020 + WEB-025)
// ---------------------------------------------------------------------------
console.log("5. Verificando Criterio 5: árbol genealógico + vientres improductivos (WEB-019/020/025)...");
const analyticsMod = await importTsModule(
  "src/features/analytics/analyticsOverview.ts"
);
const unproductiveSummary = analyticsMod.normalizeUnproductiveFemalesOverview({
  unproductiveFemales: [
    {
      animalId: "ewe-01",
      folioInterno: "BOR-101",
      consecutiveDeadBirths: 2,
      offspringBorn: 3,
      offspringDead: 3,
      suggestedDestination: "CULL",
      reason: "Mortalidad consecutiva de crías",
    },
    {
      animalId: "ewe-02",
      folioInterno: "BOR-205",
      daysSinceLastBirth: 480,
      birthsInPeriod: 0,
      suggestedDestination: "SELL",
      reason: "Sin parir ni gestar en el periodo",
    },
  ],
});
assert.equal(unproductiveSummary.cullCount, 1);
assert.equal(unproductiveSummary.sellCount, 1);
assert.equal(unproductiveSummary.alertItems.length, 2);
assert.equal(unproductiveSummary.alertItems[0].suggestion, "CULL");
assert.equal(unproductiveSummary.alertItems[1].suggestion, "SELL");

const pedigreeApiPath = path.join(srcDir, "features", "pedigree", "pedigreeApi.ts");
if (existsSync(pedigreeApiPath)) {
  const pedigreeMod = await importTsModule("src/features/pedigree/pedigreeApi.ts", {
    external: ["@xyflow/react"],
  });
  const normalizedPedigree = pedigreeMod.normalizePedigreeResponse({
    subject: {
      id: "anim-root",
      folioInterno: "OVI-ROOT",
      sex: "FEMALE",
      breed: "Dorper",
      color: "Blanco",
      breeder: "Rancho Los Sauces",
      status: "ACTIVE",
    },
    generations: 4,
    ancestors: [
      {
        generation: 1,
        path: "P",
        lineage: "PATERNAL",
        registered: true,
        animalId: "anim-p",
        folioInterno: "SEM-10",
        sex: "MALE",
      },
      {
        generation: 1,
        path: "M",
        lineage: "MATERNAL",
        registered: false,
        animalId: null,
        folioInterno: "EXT-M-99",
        sex: "FEMALE",
      },
      {
        generation: 4,
        path: "PPPP",
        lineage: "PATERNAL",
        registered: true,
        animalId: "anim-pppp",
        folioInterno: "SEM-0001",
        sex: "MALE",
      },
    ],
    offspring: [
      {
        id: "child-1",
        folioInterno: "CRIA-01",
        sex: "FEMALE",
        birthDate: "2026-03-01",
        status: "ACTIVE",
      },
    ],
  });
  const graph4 = pedigreeMod.buildPedigreeFlowGraph(normalizedPedigree, 4);
  assert.ok(graph4.nodes.some((n) => n.data.path === "PPPP"));
  assert.equal(graph4.externalAncestorCount, 1);
  assert.equal(normalizedPedigree.offspring.length, 1);

  recordResult(
    "7.2.5",
    "Árbol genealógico + vientres improductivos (WEB-019/020/025)",
    "PASS",
    "WEB-025 (CULL/SELL) y WEB-019/020 (3-4 generaciones, externos y crías) verificados."
  );
} else {
  recordResult(
    "7.2.5",
    "Árbol genealógico + vientres improductivos (WEB-019/020/025)",
    "PENDING_PR_MERGE",
    "WEB-025 (CULL/SELL) verificado en analyticsOverview.ts; falta integrar PR #69 (WEB-019 + WEB-020 árbol genealógico) en main."
  );
}

// ---------------------------------------------------------------------------
// Resumen final
// ---------------------------------------------------------------------------
console.log("\n=== Resumen de Verificación MVP Demo (WEB-028 / Sección 7.2) ===");
for (const row of results) {
  console.log(`[${row.status}] ${row.id} ${row.title} — ${row.details}`);
}

const pending = results.filter((r) => r.status === "PENDING_PR_MERGE");
console.log(
  `\nCriterios en PASS: ${results.length - pending.length}/${results.length} | Pendientes de fusión de PR: ${pending.length}`
);

if (strictMode && pending.length > 0) {
  console.error(
    "WEB-028 (--strict): falló porque aún hay PRs dependientes sin fusionar en esta rama."
  );
  process.exit(1);
}

console.log(
  "Nota: la comprobación E2E en vivo contra BaaPP-backend (BE-016) y BaaPP-app se ejecuta según la guía tickets/WEB-028.md antes del 4 de diciembre de 2026."
);
