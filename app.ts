import { Application, oakCors } from "./Dependencies/Dependecias.ts";
import { AuthRouter } from "./Routes/AuthRouter.ts";
import { SolicitudRouter } from "./Routes/SolicitudRouter.ts";
import { SistemaRouter } from "./Routes/SistemaRouter.ts";
import { config } from "./config/config.ts";
import { conectarBaseDatos } from "./Model/Conexion.ts";

const PUERTO = 8007;

// ---------- Verificación de dependencias al arrancar ----------
async function verificarArranque() {
    const problemas: string[] = [];

    // Configuración JWT
    if (!config.jwt.secret || config.jwt.secret.includes("cambia_este_secreto")) {
        problemas.push("JWT_SECRET no está configurado correctamente en .env");
    }

    // Base de datos
    try {
        await conectarBaseDatos();
        console.log("[BD] Conexión a MariaDB: OK");
    } catch (err) {
        problemas.push(`Base de datos MariaDB no disponible: ${String(err)}`);
    }

    // Directorio de uploads
    try {
        await Deno.mkdir(config.upload.dir, { recursive: true });
        await Deno.mkdir(`${config.upload.dir}/perfiles`, { recursive: true });
        await Deno.mkdir(`${config.upload.dir}/solicitudes`, { recursive: true });
        console.log("[UPLOADS] Directorios listos:", config.upload.dir);
    } catch (err) {
        problemas.push(`Directorio de uploads no disponible: ${String(err)}`);
    }

    // SMTP (no bloquea el arranque)
    const smtpOk = Boolean(config.smtp.user && config.smtp.pass);
    console.log(`[SMTP] ${smtpOk ? "Configurado (" + config.smtp.user + ")" : "NO CONFIGURADO - revisa SMTP_USER/SMTP_PASS en .env"}`);

    return problemas;
}

const problemas = await verificarArranque();
if (problemas.length > 0) {
    console.error("\n=======================================");
    console.error("ERRORES CRÍTICOS AL ARRANCAR EL SERVIDOR:");
    problemas.forEach((p) => console.error(" -", p));
    console.error("El servidor se detendrá a menos que se resuelvan.");
    console.error("=======================================\n");
    if (problemas.some((p) => p.startsWith("Base de datos") || p.startsWith("Directorio de uploads"))) {
        Deno.exit(1);
    }
}

const app = new Application();
app.use(oakCors());

// ---------- Archivos estáticos: /uploads (fotos de perfil, archivos) ----------
app.use(async (ctx, next) => {
    const pathname = ctx.request.url.pathname;
    if (pathname.startsWith("/uploads/")) {
        const rutaLocal = pathname.replace(/^\/uploads\//, "");
        if (rutaLocal.includes("..") || rutaLocal.includes("\\")) {
            ctx.response.status = 400;
            ctx.response.body = { success: false, message: "Ruta inválida" };
            return;
        }
        try {
            const bytes = await Deno.readFile(`${config.upload.dir}/${rutaLocal}`);
            ctx.response.status = 200;
            if (rutaLocal.endsWith(".jpg") || rutaLocal.endsWith(".jpeg")) ctx.response.headers.set("Content-Type", "image/jpeg");
            else if (rutaLocal.endsWith(".png")) ctx.response.headers.set("Content-Type", "image/png");
            else if (rutaLocal.endsWith(".webp")) ctx.response.headers.set("Content-Type", "image/webp");
            else if (rutaLocal.endsWith(".gif")) ctx.response.headers.set("Content-Type", "image/gif");
            else if (rutaLocal.endsWith(".pdf")) ctx.response.headers.set("Content-Type", "application/pdf");
            else if (rutaLocal.endsWith(".mp4")) ctx.response.headers.set("Content-Type", "video/mp4");
            else ctx.response.headers.set("Content-Type", "application/octet-stream");
            ctx.response.body = bytes;
        } catch {
            ctx.response.status = 404;
            ctx.response.body = { success: false, message: "Archivo no encontrado" };
        }
        return;
    }
    await next();
});

// ---------- Rutas de la API ----------
[AuthRouter, SolicitudRouter, SistemaRouter].forEach((router) => {
    app.use(router.routes());
    app.use(router.allowedMethods());
});

// ---------- 404 para rutas no encontradas ----------
app.use((ctx) => {
    ctx.response.status = 404;
    ctx.response.body = { success: false, message: "Ruta no encontrada" };
});

console.log(`\nServidor corriendo en http://127.0.0.1:${PUERTO}\n`);
await app.listen({ port: PUERTO });
