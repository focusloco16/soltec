import { Context } from "../Dependencies/Dependecias.ts";
import { verificarToken } from "../Helpers/Jwt.ts";

// Middleware que valida el token JWT en el encabezado "Authorization: Bearer TOKEN".
// Si pasa, guarda el payload (id, rol, email, nombres) en ctx.state.usuario.
export const authMiddleware = async (ctx: Context, next: () => Promise<unknown>) => {
    const { response } = ctx;
    const auth = ctx.request.headers.get("Authorization");

    if (!auth) {
        response.status = 401;
        response.body = { success: false, message: "No autenticado: falta cabecera Authorization" };
        return;
    }

    // Formato esperado: "Bearer <token>"
    const partes = auth.split(" ");
    if (partes.length !== 2 || partes[0] !== "Bearer") {
        response.status = 401;
        response.body = { success: false, message: "Formato de autorización inválido. Use: Bearer TOKEN" };
        return;
    }

    const token = partes[1];
    if (!token) {
        response.status = 401;
        response.body = { success: false, message: "Token vacío" };
        return;
    }

    try {
        const payload = await verificarToken(token) as Record<string, unknown>;
        // El payload debe traer id y rol (necesarios para autorizar)
        if (payload.id === undefined || payload.rol === undefined) {
            response.status = 401;
            response.body = { success: false, message: "Token inválido: payload incompleto" };
            return;
        }
        ctx.state.usuario = payload;
        await next();
    } catch {
        response.status = 401;
        response.body = { success: false, message: "Token inválido o expirado" };
    }
};

// Middleware que exige rol de Técnico (se usa después de authMiddleware).
export const tecnicoMiddleware = async (ctx: Context, next: () => Promise<unknown>) => {
    const payload = ctx.state.usuario as Record<string, unknown>;
    if (payload.rol !== "Tecnico") {
        ctx.response.status = 403;
        ctx.response.body = { success: false, message: "Acceso denegado: se requiere rol de Técnico" };
        return;
    }
    await next();
};
