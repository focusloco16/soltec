import { config } from "../config/config.ts";

// Genera un nombre de archivo único y seguro (sin caracteres peligrosos).
export function generarNombreUnico(nombreOriginal: string): string {
    // Extrae la extensión de forma segura
    const partes = nombreOriginal.split(".");
    const extension = partes.length > 1 ? partes.pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    // Nombre base sanitizado (solo alfanumérico, espacios -> guiones)
    const base = partes.join(".")
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .replace(/\s+/g, "_")
        .slice(0, 60) || "archivo";
    const unico = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return extension ? `${base}_${unico}.${extension}` : `${base}_${unico}`;
}

// Verifica que el tipo MIME sea permitido para foto de perfil
export function mimeFotoValido(tipo: string): boolean {
    return ["image/jpeg", "image/png", "image/webp"].includes(tipo);
}

// Verifica que el tipo MIME sea permitido para archivo de solicitud
export function mimeArchivoValido(tipo: string): boolean {
    return [
        "image/png", "image/jpeg", "image/webp", "image/gif",
        "application/pdf", "video/mp4", "video/webm",
        "text/plain", "application/zip",
    ].includes(tipo);
}

// Verifica el tamaño máximo configurado
export function tamanoValido(bytes: number): boolean {
    return bytes <= config.upload.maxFileSize;
}

// Extrae solo el nombre de archivo de una ruta guardada
export function nombreDesdeRuta(ruta: string): string {
    return ruta.split("/").pop() ?? "";
}
