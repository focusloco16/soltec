// Hash de contraseñas con PBKDF2 (WebCrypto, sin dependencias).
// Formato: saltHex$hashHex (salt aleatorio por usuario).
// Acepta también hashes antiguos SHA-256 (64 hex sin salt) para migrar
// usuarios existentes: al validar un login correcto se re-hashea a PBKDF2.

const ITERACIONES = 100_000;
const LONGITUD_SALT = 16; // bytes
const LONGITUD_CLAVE = 32; // bytes

function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return arr;
}

async function pbkdf2(clave: string, salt: Uint8Array): Promise<Uint8Array> {
    const material = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(clave),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERACIONES, hash: "SHA-256" },
        material,
        LONGITUD_CLAVE * 8
    );
    return new Uint8Array(bits);
}

// Hashea una contraseña produciendo: saltHex$PBKDF2$hashHex
export async function hashClave(clave: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(LONGITUD_SALT));
    const hash = await pbkdf2(clave, salt);
    return `${bytesToHex(salt)}$PBKDF2$${bytesToHex(hash)}`;
}

// Verifica una contraseña contra el hash almacenado.
// Retorna true si coincide. Acepta hashes antiguos SHA-256 (hex de 64 sin '$').
export async function verificarClave(clave: string, hashAlmacenado: string): Promise<boolean> {
    if (!hashAlmacenado) return false;

    // Formato nuevo: saltHex$PBKDF2$hashHex
    if (hashAlmacenado.includes("$")) {
        const partes = hashAlmacenado.split("$");
        if (partes[1] !== "PBKDF2") return false;
        const salt = hexToBytes(partes[0]);
        const hashEsperado = hexToBytes(partes[2]);
        const hashCalculado = await pbkdf2(clave, salt);
        return bytesToHex(hashCalculado) === bytesToHex(hashEsperado);
    }

    // Formato antiguo: SHA-256 simple (64 hex, sin salt)
    const datos = new TextEncoder().encode(clave);
    const digest = await crypto.subtle.digest("SHA-256", datos);
    const hashHex = bytesToHex(new Uint8Array(digest));
    return hashHex === hashAlmacenado.toLowerCase();
}

// Indica si el hash usa el formato nuevo (PBKDF2 con salt)
export function esHashNuevo(hashAlmacenado: string): boolean {
    return hashAlmacenado.includes("$PBKDF2$");
}
