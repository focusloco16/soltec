import { config } from "../config/config.ts";

// Servicio de correo SMTP (Gmail) usando credenciales del .env.
export class CorreoError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CorreoError";
    }
}

// Comprueba que SMTP está configurado.
export function smtpConfigurado(): boolean {
    return Boolean(config.smtp.user && config.smtp.pass);
}

const CRLF = "\r\n";

// Cliente SMTP mínimo compatible con Deno 2 (usando Deno.connectTls).
// Implementa el diálogo necesario para Gmail: EHLO, AUTH LOGIN,
// MAIL FROM, RCPT TO y DATA.
class ClienteSmtp {
    private conn: Deno.TlsConn | null = null;
    private buffer: Uint8Array = new Uint8Array(0);

    async conectar(): Promise<void> {
        this.conn = await Deno.connectTls({
            hostname: config.smtp.host,
            port: config.smtp.port,
        });
        await this.leerSaludo(220);
    }

    private async escribir(datos: string): Promise<void> {
        const encoder = new TextEncoder();
        await this.conn!.write(encoder.encode(datos));
    }

    private async leerRespuesta(): Promise<{ codigo: number; linea: string }> {
        let acumulado = "";
        // Lee de la red SOLO si no hay una línea completa pendiente en el buffer
        const extraerLinea = (): string | null => {
            const texto = new TextDecoder().decode(this.buffer);
            const idxFin = texto.indexOf("\n");
            if (idxFin === -1) return null;
            const linea = texto.slice(0, idxFin).replace(/\r$/, "");
            this.buffer = this.buffer.slice(idxFin + 1);
            return linea;
        };

        while (true) {
            let linea = extraerLinea();
            if (linea === null) {
                const chunks = new Uint8Array(4096);
                const leidos = await this.conn!.read(chunks);
                if (leidos === null) throw new CorreoError("Conexión SMTP cerrada inesperadamente");
                const nuevo = new Uint8Array(this.buffer.length + leidos);
                nuevo.set(this.buffer);
                nuevo.set(chunks.subarray(0, leidos), this.buffer.length);
                this.buffer = nuevo;
                linea = extraerLinea();
                if (linea === null) continue;
            }

            acumulado += linea;
            // "-" significa que hay más líneas; sino terminamos
            if (linea.length < 3 || (linea.length > 3 && linea[3] !== "-")) {
                const codigo = parseInt(linea.slice(0, 3), 10);
                if (Number.isNaN(codigo)) throw new CorreoError(`Respuesta SMTP inválida: "${acumulado}"`);
                return { codigo, linea: acumulado };
            }
        }
    }

    private async leerSaludo(codigoEsperado: number): Promise<void> {
        const r = await this.leerRespuesta();
        if (r.codigo !== codigoEsperado) throw new CorreoError(`El servidor SMTP respondió ${r.codigo}: ${r.linea}`);
    }

    private async comando(codigoEsperado: number, ...args: string[]): Promise<string> {
        await this.escribir(args.join(" ") + CRLF);
        const r = await this.leerRespuesta();
        if (r.codigo !== codigoEsperado) throw new CorreoError(`El servidor SMTP respondió ${r.codigo}: ${r.linea}`);
        return r.linea;
    }

    private async comandoAuto(codigosEsperados: number[], ...args: string[]): Promise<string> {
        await this.escribir(args.join(" ") + CRLF);
        const r = await this.leerRespuesta();
        if (!codigosEsperados.includes(r.codigo)) {
            throw new CorreoError(`El servidor SMTP respondió ${r.codigo}: ${r.linea}`);
        }
        return r.linea;
    }

    async autenticar(): Promise<void> {
        await this.comandoAuto([250, 220], "EHLO", config.smtp.host);
        await this.comando(334, "AUTH LOGIN");
        await this.comando(334, btoa(config.smtp.user));
        await this.comando(235, btoa(config.smtp.pass));
    }

    async enviar(destinatario: string, asunto: string, texto: string, html: string): Promise<void> {
        const desde = config.smtp.from || config.smtp.user;
        // Extraemos la dirección entre <...> o usamos el correo tal cual
        const mDesde = desde.match(/<([^>]+)>/);
        const direccionDesde = mDesde ? mDesde[1] : desde;

        await this.comando(250, `MAIL FROM:<${direccionDesde}>`);
        await this.comando(250, `RCPT TO:<${destinatario}>`);
        await this.comando(354, "DATA");

        const asuntoLimpio = asunto.replace(/\r|\n/g, " ").trim();
        const cabeceras =
            `From: ${desde}${CRLF}` +
            `To: ${destinatario}${CRLF}` +
            `Subject: ${asuntoLimpio}${CRLF}` +
            "MIME-Version: 1.0" + CRLF +
            `Date: ${new Date().toUTCString()}${CRLF}` +
            'Content-Type: multipart/alternative; boundary="alt_______soporte"'+CRLF+CRLF+
            "--alt_______soporte"+CRLF+
            'Content-Type: text/plain; charset="utf-8"'+CRLF+
            "Content-Transfer-Encoding: 8bit"+CRLF+CRLF+
            texto+CRLF+CRLF+
            "--alt_______soporte"+CRLF+
            'Content-Type: text/html; charset="utf-8"'+CRLF+
            "Content-Transfer-Encoding: 8bit"+CRLF+CRLF+
            html+CRLF+CRLF+
            "--alt_______soporte--";

        await this.escribir(cabeceras + CRLF);
        // El punto final de DATA se envía en su propia línea
        await this.escribir("." + CRLF);
        await this.leerSaludo(250); // aceptado para entrega
    }

    async despedirse(): Promise<void> {
        try {
            await this.escribir("QUIT" + CRLF);
        } catch { /* ignorar */ }
    }

    async cerrar(): Promise<void> {
        try { if (this.conn) this.conn.close(); } catch { /* ignorar */ }
        this.conn = null;
    }
}

// Abre una conexión SMTP y la cierra. Permite diagnosticar la conexión.
export async function probarConexionSmtp(): Promise<void> {
    if (!smtpConfigurado()) {
        throw new CorreoError("SMTP no configurado. Revisa SMTP_USER y SMTP_PASS en .env");
    }
    const cliente = new ClienteSmtp();
    try {
        await cliente.conectar();
        await cliente.autenticar();
    } finally {
        await cliente.despedirse();
        await cliente.cerrar();
    }
}

// Envía un correo real. Lanza CorreoError si falla.
export async function enviarCorreo(destinatario: string, asunto: string, html: string): Promise<void> {
    if (!smtpConfigurado()) {
        throw new CorreoError("SMTP no configurado. Configura SMTP_USER y SMTP_PASS en .env");
    }
    const texto = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    const cliente = new ClienteSmtp();
    try {
        await cliente.conectar();
        await cliente.autenticar();
        await cliente.enviar(destinatario, asunto, texto, html);
    } catch (error) {
        throw new CorreoError(`Error al enviar correo a ${destinatario}: ${String(error)}`);
    } finally {
        await cliente.despedirse();
        await cliente.cerrar();
    }
}

// ---------- Plantillas HTML ----------

function plantillaBase(titulo: string, cuerpo: string): string {
    return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <tr><td style="background:#2563eb;color:#ffffff;padding:20px 24px">
            <h2 style="margin:0;font-size:20px">${titulo}</h2>
          </td></tr>
          <tr><td style="padding:24px;color:#0f172a;line-height:1.6;font-size:15px">
            ${cuerpo}
          </td></tr>
          <tr><td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:13px">
            Sistema de Solicitudes de Soporte Técnico. Por favor no respondas a este correo.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// Al crear una solicitud
export function plantillaSolicitudCreada(nombre: string, id: number, asunto: string, prioridad: string): string {
    const cuerpo = `<p>Hola <strong>${nombre}</strong>,</p>
<p>Tu solicitud de soporte <strong>#${id}</strong> ha sido registrada correctamente.</p>
<ul>
  <li><strong>Asunto:</strong> ${asunto}</li>
  <li><strong>Prioridad:</strong> ${prioridad}</li>
  <li><strong>Estado:</strong> Pendiente</li>
</ul>
<p>Puedes consultar el estado desde la plataforma.</p>`;
    return plantillaBase(`Solicitud de soporte #${id} registrada`, cuerpo);
}

// Al cambiar el estado (excepto Solucionada)
export function plantillaCambioEstado(nombre: string, id: number, estado: string, asunto: string): string {
    const cuerpo = `<p>Hola <strong>${nombre}</strong>,</p>
<p>Tu solicitud <strong>#${id}</strong> ha cambiado de estado.</p>
<ul>
  <li><strong>Nuevo estado:</strong> ${estado}</li>
  <li><strong>Asunto:</strong> ${asunto}</li>
</ul>
<p>Puedes consultar el detalle desde la plataforma.</p>`;
    return plantillaBase(`Actualización de solicitud #${id}`, cuerpo);
}

// Al cerrar la solicitud
export function plantillaSolicitudCerrada(nombre: string, id: number, asunto: string): string {
    const cuerpo = `<p>Hola <strong>${nombre}</strong>,</p>
<p>Tu solicitud <strong>#${id}</strong> ha sido marcada como solucionada.</p>
<ul>
  <li><strong>Asunto:</strong> ${asunto}</li>
  <li><strong>Estado:</strong> Solucionada/Cerrada</li>
</ul>
<p>Gracias por usar el servicio de soporte.</p>`;
    return plantillaBase(`Solicitud #${id} solucionada`, cuerpo);
}
