/**
 * WEB-027 — Catálogo centralizado de mensajes de error y etiquetas en español
 * mexicano ganadero (importaciones Excel / Sábana, bloqueo anti-fraude de 30 días,
 * inventario ovino, permisos multi-rancho y errores de red entre navegadores).
 */

export interface ResolveApiErrorInput {
  status: number;
  code?: string;
  rawMessage?: string;
  path?: string;
}

const DOMAIN_CODE_MESSAGES: Record<string, string> = {
  // Bloqueo anti-fraude de 30 días y auditoría de nacimientos
  BIRTH_LOCKED_30_DAYS:
    "Este parto superó el bloqueo de 30 días y ya no puede modificarse directamente. Solicita a tu técnico o asociación una corrección auditada con fotografía de evidencia.",
  BIRTH_LOCKED:
    "Este parto superó el bloqueo de 30 días y ya no puede modificarse directamente. Solicita a tu técnico o asociación una corrección auditada con fotografía de evidencia.",
  BIRTH_EDIT_LOCKED:
    "Este parto superó el bloqueo de 30 días y ya no puede modificarse directamente. Solicita a tu técnico o asociación una corrección auditada con fotografía de evidencia.",
  BIRTH_WINDOW_EXPIRED:
    "Se venció la ventana de 30 días para editar este parto. Solo un técnico veterinario o la asociación puede corregirlo mediante auditoría con evidencia fotográfica.",
  RETROACTIVE_BIRTH_LOCKED:
    "No se permite registrar partos con más de 30 días de antigüedad por alta ordinaria. Solicita un alta extemporánea auditada con tu técnico o asociación.",
  LATE_BIRTH_REQUIRES_AUDIT:
    "Los partos con más de 30 días de antigüedad requieren un registro auditado con motivo y fotografía de respaldo desde la bandeja de auditoría.",
  EVIDENCE_PHOTO_REQUIRED:
    "Falta la fotografía de evidencia obligatoria para respaldar la auditoría del parto.",
  MISSING_EVIDENCE_PHOTO:
    "Falta la fotografía de evidencia obligatoria para respaldar la auditoría del parto.",
  AUDIT_REASON_REQUIRED:
    "Debes capturar el motivo de la corrección o alta extemporánea del parto antes de guardar.",
  REASON_REQUIRED:
    "Debes capturar el motivo de la corrección o alta extemporánea antes de guardar.",

  // Importaciones / exportaciones de Excel (Sábana oficial .xlsx)
  EXCEL_INVALID_FORMAT:
    "El archivo de Excel no es válido. Sube una sábana en formato .xlsx o .xls sin contraseña ni hojas dañadas.",
  INVALID_EXCEL_FILE:
    "El archivo de Excel no es válido. Sube una sábana en formato .xlsx o .xls sin contraseña ni hojas dañadas.",
  UNSUPPORTED_SPREADSHEET_FORMAT:
    "Formato de hoja de cálculo no compatible. Utiliza un archivo Excel (.xlsx o .xls) basado en la sábana oficial.",
  EXCEL_MISSING_COLUMNS:
    "Faltan columnas obligatorias en el archivo de Excel (revisa folio interno, fecha de nacimiento, raza y sexo en la sábana oficial). Descarga la plantilla vigente y vuelve a intentarlo.",
  MISSING_REQUIRED_COLUMNS:
    "Faltan columnas obligatorias en el archivo de Excel. Verifica que los encabezados coincidan con la sábana oficial antes de volver a subirlo.",
  INVALID_SABANA_HEADERS:
    "Los encabezados del archivo de Excel no coinciden con la sábana oficial de la asociación. Revisa el orden y nombre de las columnas.",
  EXCEL_EMPTY_FILE:
    "El archivo de Excel no contiene ejemplares para importar. Verifica que la hoja tenga datos debajo de los encabezados.",
  EMPTY_IMPORT_FILE:
    "El archivo de importación está vacío. Agrega al menos un ejemplar antes de subir la sábana.",
  EXCEL_ROW_VALIDATION_ERROR:
    "Algunas filas del archivo de Excel tienen datos incompletos o inválidos (arete, chip SINIIGA, fecha o peso). Corrige las filas indicadas y vuelve a subir la sábana.",
  IMPORT_VALIDATION_FAILED:
    "No se pudo importar el archivo de Excel porque hay filas con datos ganaderos inválidos (fechas, sexo, peso o folios). Revisa el detalle y vuelve a intentarlo.",
  EXCEL_DUPLICATE_ROWS:
    "El archivo de Excel contiene aretes o folios internos repetidos. Elimina los duplicados en la hoja y vuelve a importarla.",
  IMPORT_DUPLICATE_FOLIO:
    "El archivo de Excel incluye folios internos que ya existen en el rebaño. Revisa los aretes repetidos antes de importar.",
  IMPORT_FILE_TOO_LARGE:
    "El archivo de Excel supera el tamaño máximo permitido. Divide la sábana en lotes más pequeños y vuelve a intentarlo.",
  PAYLOAD_TOO_LARGE:
    "El archivo supera el tamaño máximo permitido por el portal. Reduce el tamaño del archivo o fotografía e inténtalo de nuevo.",

  // Rebaño, ejemplares, SINIIGA, rancho y permisos multi-rancho
  RANCH_ACCESS_DENIED:
    "El usuario autenticado no tiene acceso al rancho activo.",
  INSUFFICIENT_PERMISSION:
    "No cuentas con los permisos necesarios para realizar esta operación en el rancho activo.",
  ANIMAL_NOT_FOUND:
    "No se encontró el ejemplar solicitado en el rancho activo.",
  BIRTH_NOT_FOUND:
    "No se encontró el registro de parto solicitado en el rancho activo.",
  RANCH_NOT_FOUND:
    "No se encontró el rancho solicitado o dejó de estar asignado a tu cuenta.",
  DUPLICATE_FOLIO:
    "Ya existe otro ejemplar con ese folio interno (arete) en el rancho activo.",
  FOLIO_ALREADY_EXISTS:
    "Ya existe otro ejemplar con ese folio interno (arete) en el rancho activo.",
  DUPLICATE_SINIIGA_CHIP:
    "Ese chip SINIIGA ya está asignado a otro ejemplar. Verifica el número del arete electrónico.",
  SINIIGA_CHIP_ALREADY_EXISTS:
    "Ese chip SINIIGA ya está asignado a otro ejemplar. Verifica el número del arete electrónico.",
  DUPLICATE_REGISTRO_UNO:
    "Ese folio de registro UNO ya está capturado en el rebaño.",
  DUPLICATE_USERNAME:
    "Ese nombre de usuario ya existe. Elige otro identificador para la cuenta rama.",
  USERNAME_ALREADY_EXISTS:
    "Ese nombre de usuario ya existe. Elige otro identificador para la cuenta rama.",
  INVALID_WEANING_TARGET:
    "Los días objetivo de destete deben ser 60, 75 o 90 días.",
  SINIIGA_EXCESS_CHIPS:
    "La cantidad de chips SINIIGA solicitados supera el límite permitido de crías vivas para ese parto.",
  CHIP_QUOTA_EXCEEDED:
    "La cantidad de chips SINIIGA solicitados supera el límite permitido de crías vivas para ese parto.",
};

const GENERIC_RAW_PATTERNS: ReadonlyArray<RegExp> = [
  /^http\s+\d{3}$/i,
  /^(?:bad request|unauthorized|forbidden|not found|conflict|unprocessable entity|locked|too many requests|internal server error|bad gateway|service unavailable|gateway timeout)$/i,
];

const ENGLISH_DOMAIN_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  {
    pattern: /(?:30\s*days?|thirty\s*days?).*(?:lock|window|retroactive|expired|edit|modif)|(?:birth|parto).*(?:locked|frozen|immutable)/i,
    message:
      "Este parto superó el bloqueo de 30 días y ya no puede modificarse directamente. Solicita a tu técnico o asociación una corrección auditada con fotografía de evidencia.",
  },
  {
    pattern: /(?:excel|xlsx|xls|spreadsheet|workbook|sheet).*(?:invalid|corrupt|unsupported|format|parse|read)/i,
    message:
      "El archivo de Excel no se pudo leer o tiene un formato inválido. Sube una sábana oficial en formato .xlsx o .xls sin contraseña.",
  },
  {
    pattern: /(?:excel|xlsx|spreadsheet|csv|import).*(?:column|header|missing|required)/i,
    message:
      "Faltan columnas obligatorias en el archivo de Excel. Verifica que los encabezados coincidan con la sábana oficial y vuelve a subirlo.",
  },
  {
    pattern: /(?:excel|xlsx|spreadsheet|import).*(?:empty|no rows)/i,
    message:
      "El archivo de Excel no contiene ejemplares para importar. Agrega registros debajo de los encabezados y vuelve a intentarlo.",
  },
  {
    pattern: /(?:duplicate|already exists).*(?:folio|ear\s*tag|arete)/i,
    message:
      "Ya existe otro ejemplar con ese folio interno (arete) en el rancho activo.",
  },
  {
    pattern: /(?:duplicate|already exists).*(?:siniiga|chip)/i,
    message:
      "Ese chip SINIIGA ya está asignado a otro ejemplar. Revisa el número del arete electrónico.",
  },
  {
    pattern: /(?:duplicate|already exists).*(?:username|user)/i,
    message:
      "Ese nombre de usuario ya existe. Elige otro identificador para la cuenta rama.",
  },
  {
    pattern: /(?:animal|ejemplar).*(?:not found)/i,
    message: "No se encontró el ejemplar solicitado en el rancho activo.",
  },
  {
    pattern: /(?:ranch|rancho).*(?:access denied|forbidden|not assigned)/i,
    message: "El usuario autenticado no tiene acceso al rancho activo.",
  },
];

const ENGLISH_ERROR_CUE_PATTERN =
  /\b(?:invalid|missing|required|cannot|must|should|already|exists|not\s+found|failed|unable|could\s+not|unexpected|unauthorized|forbidden|expired|locked|duplicate|too\s+large|unsupported|between|before|after|does\s+not|is\s+not|are\s+not|the|with|from|into|row|rows|sheet|column|columns|field|fields|weight|birth|date|value|empty|negative)\b/i;

const SPANISH_ESTABLISHED_PATTERN =
  /[áéíóúüñ¿¡]|\b(?:el|la|los|las|un|una|del|al|por|para|con|sin|no\s+se|no\s+puede|no\s+pueden|debe|deben|contiene|falta|faltan|revisa|verifica|fila|arete|ejemplar|borrega|destete|parto|rancho|peso|fecha|inv[aá]lid[oa]s?|duplicad[oa]s?|obligatori[oa]s?)\b/i;

function isGenericTechnicalMessage(trimmed: string): boolean {
  if (!trimmed) return true;
  return GENERIC_RAW_PATTERNS.some((re) => re.test(trimmed));
}

function isEstablishedSpanishMessage(trimmed: string): boolean {
  if (!trimmed || isGenericTechnicalMessage(trimmed)) return false;
  if (ENGLISH_ERROR_CUE_PATTERN.test(trimmed)) return false;
  if (ENGLISH_DOMAIN_PATTERNS.some((entry) => entry.pattern.test(trimmed))) {
    return false;
  }
  return SPANISH_ESTABLISHED_PATTERN.test(trimmed);
}

function statusFallbackMessage(status: number, path?: string): string {
  const lowerPath = (path ?? "").toLowerCase();
  const isImportPath =
    lowerPath.includes("import") ||
    lowerPath.includes("excel") ||
    lowerPath.includes("sabana");
  const isBirthPath =
    lowerPath.includes("birth") ||
    lowerPath.includes("parto") ||
    lowerPath.includes("audit");

  switch (status) {
    case 400:
      if (isImportPath) {
        return "El archivo de Excel tiene datos o columnas inválidas. Revisa la sábana oficial y vuelve a intentarlo.";
      }
      return "Los datos enviados no son válidos. Revisa los campos marcados (arete, fechas o cantidades) e inténtalo de nuevo.";
    case 401:
      return "Tu sesión venció o las credenciales no son válidas. Vuelve a iniciar sesión para continuar.";
    case 403:
      return "Acceso denegado (403): no tienes permisos para realizar esta operación en el rancho activo.";
    case 404:
      return "No se encontró el registro solicitado en el rancho activo.";
    case 408:
      return "La conexión tardó demasiado en responder. Revisa tu señal de internet e inténtalo de nuevo.";
    case 409:
      if (isBirthPath) {
        return "Este parto ya no puede modificarse directamente (bloqueo de 30 días o registro duplicado). Verifica en la bandeja de auditoría.";
      }
      return "Conflicto al guardar: el registro ya existe o tiene un arete/chip duplicado en el rancho.";
    case 413:
      return "El archivo seleccionado supera el tamaño máximo permitido. Reduce el archivo o la fotografía antes de subirlo.";
    case 415:
      return "Formato de archivo no compatible. Sube únicamente archivos Excel (.xlsx/.xls) o fotografías JPG, PNG y WebP.";
    case 422:
      if (isImportPath) {
        return "No se pudo importar la sábana de Excel porque algunas filas contienen datos ganaderos inválidos (fechas, sexo, peso o folios).";
      }
      return "No se pudo procesar la información porque contiene datos ganaderos inválidos. Revisa fechas, cantidades y campos obligatorios.";
    case 423:
      return "Este parto está bloqueado por la regla anti-fraude de 30 días. Solicita una corrección auditada con tu técnico o asociación.";
    case 429:
      return "Se realizaron demasiadas solicitudes seguidas. Espera unos segundos antes de volver a intentarlo.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "El servidor del portal presentó un problema temporal. Inténtalo de nuevo en un momento.";
    default:
      return `No se pudo completar la operación en el portal (código ${status}). Inténtalo de nuevo en un momento.`;
  }
}

export function resolveApiErrorMessage({
  status,
  code,
  rawMessage,
  path,
}: ResolveApiErrorInput): string {
  const trimmedRaw = typeof rawMessage === "string" ? rawMessage.trim() : "";
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";

  if (normalizedCode && normalizedCode in DOMAIN_CODE_MESSAGES) {
    // Si el backend ya envió un mensaje detallado claramente en español (p. ej. indicando número de fila),
    // lo respetamos salvo en códigos de seguridad 403 con contrato explícito.
    if (status !== 403 && isEstablishedSpanishMessage(trimmedRaw)) {
      return trimmedRaw;
    }
    return DOMAIN_CODE_MESSAGES[normalizedCode];
  }

  if (trimmedRaw) {
    for (const entry of ENGLISH_DOMAIN_PATTERNS) {
      if (entry.pattern.test(trimmedRaw)) {
        return entry.message;
      }
    }
    if (isEstablishedSpanishMessage(trimmedRaw)) {
      return trimmedRaw;
    }
  }

  return statusFallbackMessage(status, path);
}

/**
 * Normaliza errores de red crudos de Chrome ("Failed to fetch"),
 * Firefox ("NetworkError when attempting to fetch resource.") y Safari/Edge
 * ("Load failed") a mensajes claros en español mexicano ganadero.
 */
export function formatNetworkError(err: unknown, fallback?: string): string {
  const msg = err instanceof Error ? err.message.trim() : "";
  if (
    /failed to fetch|networkerror|load failed|network request failed|fetch failed|err_network|cors/i.test(
      msg
    )
  ) {
    return "No se pudo conectar con el servidor del portal. Verifica tu conexión a internet o que el servicio del rancho esté disponible e inténtalo de nuevo.";
  }
  if (/timeout|timed out|aborted/i.test(msg)) {
    return "La conexión tardó demasiado en responder. Inténtalo de nuevo en un momento.";
  }
  if (isEstablishedSpanishMessage(msg)) {
    return msg;
  }
  return (
    fallback ||
    "Ocurrió un error inesperado al comunicarse con el portal. Inténtalo de nuevo."
  );
}

const ROLE_LABELS_ES: Record<string, string> = {
  OWNER: "Productor",
  ASSOCIATION_SUPERUSER: "Asociación",
  VET_TECHNICIAN: "Técnico veterinario",
  WORKER_BRANCH: "Cuenta rama",
};

export function translateRoleLabel(role?: string | null): string {
  const key = (role ?? "").trim().toUpperCase().replace(/^ROLE_/, "");
  if (!key) return "Usuario";
  return ROLE_LABELS_ES[key] ?? key;
}
