import { create, verify, getNumericDate } from "../Dependencies/Dependecias.ts";
import { config } from "../config/config.ts";

const CLAVE_SECRETA = config.jwt.secret || "secreto_inseguro_reemplazar";

const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(CLAVE_SECRETA),
    { name: "HMAC", hash: "SHA-512" },
    true,
    ["sign", "verify"]
);

function expiracionSegundos(expiraEn: string): number {
    // Acepta formato tipo "8h", "30m", "7d" o segundos
    const match = expiraEn.match(/^(\d+)([smhd])$/);
    if (!match) return 60 * 60 * 8; // 8h por defecto
    const num = Number(match[1]);
    const unidad = match[2];
    const multiplicadores: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return num * (multiplicadores[unidad] ?? 3600);
}

export function crearToken(payload: Record<string, unknown>): Promise<string> {
    const exp = getNumericDate(expiracionSegundos(config.jwt.expiraEn));
    return create({ alg: "HS512", type: "JWT" }, { ...payload, exp }, key);
}

export function verificarToken(token: string): Promise<Record<string, unknown>> {
    return verify(token, key);
}
