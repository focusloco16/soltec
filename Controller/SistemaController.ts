import { RouterContext, Context } from "../Dependencies/Dependecias.ts";
import { config } from "../config/config.ts";
import { smtpConfigurado, probarConexionSmtp, enviarCorreo, CorreoError } from "../Helpers/CorreoHelper.ts";
import { conectarBaseDatos } from "../Model/Conexion.ts";

// GET /api/health - estado de dependencias críticas (BD, uploads, SMTP)
export const health = async (ctx: Context) => {
    const problemas: string[] = [];
    const estado: Record<string, unknown> = {};

    // Base de datos
    try {
        await conectarBaseDatos();
        estado.bd = "ok";
    } catch (err) {
        estado.bd = "error";
        problemas.push(`Base de datos: ${String(err)}`);
    }

    // Directorio de uploads
    try {
        await Deno.mkdir(config.upload.dir, { recursive: true });
        estado.uploads = "ok";
    } catch (err) {
        estado.uploads = "error";
        problemas.push(`Directorio uploads: ${String(err)}`);
    }

    // SMTP configurado
    estado.smtpConfigurado = smtpConfigurado();
    if (!smtpConfigurado()) {
        problemas.push("SMTP no configurado (faltan SMTP_USER/SMTP_PASS en .env)");
    }

    const ok = problemas.length === 0;
    ctx.response.status = ok ? 200 : 503;
    ctx.response.body = { success: ok, estado, problemas };
};

// POST /api/test-email - envía un correo de prueba vía SMTP (solo si el secreto JWT está cambiado)
export const testEmail = async (ctx: Context) => {
    const { response } = ctx;
    // Solo en desarrollo: evitar disparos accidentales con el secreto por defecto
    const esSeguro = !config.jwt.secret.includes("cambia_este_secreto");

    if (!smtpConfigurado()) {
        response.status = 422;
        response.body = { success: false, message: "SMTP no configurado. Configura SMTP_USER y SMTP_PASS en .env" };
        return;
    }

    try {
        // 1. Probar la conexión SMTP
        await probarConexionSmtp();
        // 2. Enviar correo de prueba al remitente configurado
        await enviarCorreo(
            config.smtp.user,
            "Prueba de correo - Sistema de Soporte Técnico",
            `<p>Este es un correo de prueba.</p><p>Si lo estás viendo, la configuración SMTP funciona correctamente.</p>`
        );
        response.status = 200;
        response.body = { success: true, message: `Correo de prueba enviado a ${config.smtp.user}` };
    } catch (error) {
        const detalle = error instanceof CorreoError ? error.message : String(error);
        console.error("[testEmail]", detalle);
        response.status = 502;
        response.body = { success: false, message: "No se pudo enviar el correo de prueba", error: detalle };
    }
};
