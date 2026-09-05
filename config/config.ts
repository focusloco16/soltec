// Configuración centralizada del backend.
// Se lee desde .env (fallback: variables del entorno del proceso).

function leerEnv(): Record<string, string> {
    // Deno.env.get("X") lee de las variables del entorno del proceso.
    // También se intenta cargar el archivo .env manualmente si existe.
    const valores: Record<string, string> = {};
    try {
        const texto = Deno.readTextFileSync(".env");
        for (const linea of texto.split("\n")) {
            const l = linea.trim();
            if (!l || l.startsWith("#") || !l.includes("=")) continue;
            const idx = l.indexOf("=");
            const clave = l.slice(0, idx).trim();
            const valor = l.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
            valores[clave] = valor;
        }
    } catch {
        // Sin .env: se usan solo las variables del entorno del proceso.
    }
    return valores;
}

const envArchivo = leerEnv();

function get(clave: string, porDefecto?: string): string {
    const delProceso = Deno.env.get(clave);
    if (delProceso !== undefined && delProceso !== "") return delProceso;
    if (envArchivo[clave] !== undefined && envArchivo[clave] !== "") return envArchivo[clave];
    return porDefecto ?? "";
}

export const config = {
    db: {
        host: get("DB_HOST", "127.0.0.1"),
        port: Number(get("DB_PORT", "3306")),
        user: get("DB_USER", "root"),
        password: get("DB_PASSWORD", ""),
        name: get("DB_NAME", "adso_cimm"),
    },
    jwt: {
        secret: get("JWT_SECRET", ""),
        expiraEn: get("JWT_EXPIRES_IN", "8h"),
    },
    smtp: {
        host: get("SMTP_HOST", "smtp.gmail.com"),
        port: Number(get("SMTP_PORT", "465")),
        user: get("SMTP_USER", ""),
        pass: get("SMTP_PASS", ""),
        from: get("SMTP_FROM", "Soporte Técnico"),
    },
    upload: {
        dir: get("UPLOAD_DIR", "./uploads"),
        maxFileSize: Number(get("MAX_FILE_SIZE", "5242880")),
    },
};

// Tipos permitidos para foto de perfil y archivos de solicitud
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp"];
export const ARCHIVO_TIPOS = [
    "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/svg+xml",
    "application/pdf",
    "video/mp4", "video/webm", "video/x-msvideo", "video/quicktime",
    "audio/mpeg", "audio/wav", "audio/ogg",
    "text/plain", "text/csv", "text/html", "text/rtf",
    "application/zip", "application/x-zip-compressed", "application/x-rar-compressed", "application/x-7z-compressed",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/octet-stream",
];

// Estados y prioridades válidas (validación estricta en backend)
export const ESTADOS = ["Pendiente", "En proceso", "En espera", "Solucionada", "Cerrada"];
export const PRIORIDADES = ["Baja", "Media", "Alta", "Critica"];
