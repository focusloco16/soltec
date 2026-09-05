import { RouterContext } from "../Dependencies/Dependecias.ts";
import { SolicitudModel, SolicitudLista } from "../Model/SolicitudModel.ts";
import { ArchivoModel } from "../Model/ArchivoModel.ts";
import { UsuarioModel } from "../Model/UsuarioModel.ts";
import { config, ESTADOS, PRIORIDADES, ARCHIVO_TIPOS } from "../config/config.ts";
import { generarNombreUnico, mimeArchivoValido, tamanoValido, nombreDesdeRuta } from "../Helpers/ArchivoHelper.ts";
import { enviarCorreo, plantillaSolicitudCreada, plantillaCambioEstado, plantillaSolicitudCerrada, CorreoError } from "../Helpers/CorreoHelper.ts";

// GET /api/solicitudes
// Usuario: solo las suyas. Técnico: todas.
// Soporta: ?page, ?limit, ?search, ?estado, ?prioridad, ?sort, ?order
export const listar = async (ctx: RouterContext<"/api/solicitudes">) => {
    const { response } = ctx;
    try {
        const payload = ctx.state.usuario as Record<string, unknown>;
        const url = new URL(ctx.request.url);

        const page = Number(url.searchParams.get("page") || "1");
        const limit = Number(url.searchParams.get("limit") || "10");
        const search = url.searchParams.get("search") || "";
        const estado = url.searchParams.get("estado") || "";
        const prioridad = url.searchParams.get("prioridad") || "";
        const sort = url.searchParams.get("sort") || "fecha_creacion";
        const order = (url.searchParams.get("order") || "DESC") as "ASC" | "DESC";

        if (estado && !ESTADOS.includes(estado)) {
            response.status = 422;
            response.body = { success: false, message: "Estado inválido" };
            return;
        }
        if (prioridad && !PRIORIDADES.includes(prioridad)) {
            response.status = 422;
            response.body = { success: false, message: "Prioridad inválida" };
            return;
        }

        const obj = new SolicitudModel();
        const result = payload.rol === "Tecnico"
            ? await obj.SeleccionarTodasPaginado({ page, limit, search, estado, prioridad, sort, order })
            : await obj.SeleccionarPorUsuarioPaginado(Number(payload.id), { page, limit, search, estado, prioridad, sort, order });

        response.status = 200;
        response.body = { success: true, ...result };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al listar solicitudes" };
        console.error("[listar]", String(error));
    }
};

// GET /api/solicitudes/:id
export const obtenerPorId = async (ctx: RouterContext<"/api/solicitudes/:id">) => {
    const { response } = ctx;
    try {
        const payload = ctx.state.usuario as Record<string, unknown>;
        const id = Number(ctx.params.id);
        if (!Number.isInteger(id)) { response.status = 422; response.body = { success: false, message: "ID inválido" }; return; }

        const solicitud = await new SolicitudModel().SeleccionarPorId(id);
        if (!solicitud) { response.status = 404; response.body = { success: false, message: "Solicitud no encontrada" }; return; }

        // Permiso: técnico puede ver todas; usuario solo las propias
        if (payload.rol !== "Tecnico" && solicitud.usuario_id !== Number(payload.id)) {
            response.status = 403;
            response.body = { success: false, message: "No tienes acceso a esta solicitud" };
            return;
        }

        const archivos = await new ArchivoModel().SeleccionarPorSolicitud(id);
        response.status = 200;
        response.body = { success: true, data: { ...solicitud, archivos } };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al obtener la solicitud" };
        console.error("[obtenerPorId]", String(error));
    }
};

// POST /api/solicitudes
// multipart/form-data: asunto, descripcion, prioridad, archivo (opcional)
export const crear = async (ctx: RouterContext<"/api/solicitudes">) => {
    const { response } = ctx;
    try {
        const payload = ctx.state.usuario as Record<string, unknown>;
        const form = await ctx.request.body.formData();
        const asunto = (form.get("asunto") || "").toString().trim();
        const descripcion = (form.get("descripcion") || "").toString().trim();
        const prioridad = (form.get("prioridad") || "").toString();
        const archivo = form.get("archivo") as File | null;

        if (!asunto || !descripcion) {
            response.status = 422;
            response.body = { success: false, message: "Asunto y descripción son obligatorios" };
            return;
        }
        if (!PRIORIDADES.includes(prioridad)) {
            response.status = 422;
            response.body = { success: false, message: "Prioridad inválida" };
            return;
        }

        // Validar archivo ANTES de guardar la solicitud (evita solicitudes con archivo inválido)
        if (archivo && archivo.size > 0) {
            if (!tamanoValido(archivo.size)) {
                response.status = 413;
                response.body = { success: false, message: `El archivo excede el tamaño máximo (${config.upload.maxFileSize} bytes)` };
                return;
            }
            if (!mimeArchivoValido(archivo.type)) {
                response.status = 422;
                response.body = { success: false, message: "Tipo de archivo no permitido. Use PNG, JPG, WEBP, GIF, PDF, MP4, WEBM, TXT o ZIP", tiposPermitidos: ARCHIVO_TIPOS };
                return;
            }
        }

        const solicitudId = await new SolicitudModel().Insertar({
            usuario_id: Number(payload.id),
            asunto,
            descripcion,
            prioridad: prioridad as "Baja" | "Media" | "Alta" | "Critica",
        });

        // Guardar archivo físico y registrar metadata en BD
        if (archivo && archivo.size > 0) {
            await Deno.mkdir(`${config.upload.dir}/solicitudes`, { recursive: true });
            const nombreGuardado = generarNombreUnico(archivo.name);
            const bytes = new Uint8Array(await archivo.arrayBuffer());
            await Deno.writeFile(`${config.upload.dir}/solicitudes/${nombreGuardado}`, bytes);
            await new ArchivoModel().Insertar({
                solicitud_id: solicitudId,
                nombre_archivo: archivo.name,
                ruta_archivo: `/uploads/solicitudes/${nombreGuardado}`,
                tipo_archivo: archivo.type,
            });
        }

        // Correo de confirmación: si falla se registra el error pero no se pierde la solicitud
        const usuario = await new UsuarioModel().SeleccionarPorId(Number(payload.id));
        try {
            await enviarCorreo(
                usuario?.email ?? String(payload.email),
                `Solicitud de soporte #${solicitudId} registrada`,
                plantillaSolicitudCreada(usuario?.nombres ?? "Usuario", solicitudId, asunto, prioridad)
            );
        } catch (err) {
            console.error(`[crear/solicitud #${solicitudId}] Error enviando correo:`, String(err));
        }

        response.status = 201;
        response.body = { success: true, message: "Solicitud registrada correctamente", data: { id: solicitudId } };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al crear la solicitud" };
        console.error("[crear]", String(error));
    }
};

// PATCH /api/solicitudes/:id/estado - solo Técnico. El correo es secundario.
export const cambiarEstado = async (ctx: RouterContext<"/api/solicitudes/:id/estado">) => {
    const { response } = ctx;
    try {
        const id = Number(ctx.params.id);
        if (!Number.isInteger(id)) { response.status = 422; response.body = { success: false, message: "ID inválido" }; return; }

        const body = await ctx.request.body.json();
        const estado = body.estado as string;
        if (!ESTADOS.includes(estado)) {
            response.status = 422;
            response.body = { success: false, message: `Estado inválido. Válidos: ${ESTADOS.join(", ")}` };
            return;
        }

        const obj = new SolicitudModel();
        const solicitud: SolicitudLista = await obj.SeleccionarPorId(id) as SolicitudLista;
        if (!solicitud) { response.status = 404; response.body = { success: false, message: "Solicitud no encontrada" }; return; }

        // Operación principal: actualizar el estado en MySQL (siempre persiste)
        await obj.ActualizarEstado(id, estado);

        // Correo: si falla se registra, pero la actualización NO se pierde.
        const usuario = await new UsuarioModel().SeleccionarPorId(solicitud.usuario_id);
        try {
            if (estado === "Cerrada" || estado === "Solucionada") {
                await enviarCorreo(
                    solicitud.email_usuario,
                    `Solicitud #${id} solucionada`,
                    plantillaSolicitudCerrada(usuario?.nombres ?? "Usuario", id, solicitud.asunto)
                );
            } else {
                await enviarCorreo(
                    solicitud.email_usuario,
                    `Actualización de solicitud #${id}`,
                    plantillaCambioEstado(usuario?.nombres ?? "Usuario", id, estado, solicitud.asunto)
                );
            }
        } catch (err) {
            console.error(`[cambiarEstado/solicitud #${id}] Error enviando correo:`, String(err));
        }

        response.status = 200;
        response.body = { success: true, message: `Solicitud actualizada al estado '${estado}'` };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al actualizar la solicitud" };
        console.error("[cambiarEstado]", String(error));
    }
};

// PATCH /api/solicitudes/:id/asignar - solo Técnico
export const asignarTecnico = async (ctx: RouterContext<"/api/solicitudes/:id/asignar">) => {
    const { response } = ctx;
    try {
        const payload = ctx.state.usuario as Record<string, unknown>;
        const id = Number(ctx.params.id);
        if (!Number.isInteger(id)) { response.status = 422; response.body = { success: false, message: "ID inválido" }; return; }

        const solicitud = await new SolicitudModel().SeleccionarPorId(id);
        if (!solicitud) { response.status = 404; response.body = { success: false, message: "Solicitud no encontrada" }; return; }

        await new SolicitudModel().AsignarTecnico(id, Number(payload.id));
        response.status = 200;
        response.body = { success: true, message: `Solicitud #${id} asignada a ti correctamente` };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al asignar la solicitud" };
        console.error("[asignarTecnico]", String(error));
    }
};

// GET /api/solicitudes/:id/archivos/:archivoId/download
export const descargarArchivo = async (ctx: RouterContext<"/api/solicitudes/:id/archivos/:archivoId/download">) => {
    const { response } = ctx;
    try {
        const payload = ctx.state.usuario as Record<string, unknown>;
        const solicitudId = Number(ctx.params.id);
        const archivoId = Number(ctx.params.archivoId);
        if (!Number.isInteger(solicitudId) || !Number.isInteger(archivoId)) {
            response.status = 422; response.body = { success: false, message: "ID inválido" }; return;
        }

        // El archivo debe pertenecer a la solicitud indicada
        const archivo = await new ArchivoModel().SeleccionarPorId(archivoId);
        if (!archivo || archivo.solicitud_id !== solicitudId) {
            response.status = 404; response.body = { success: false, message: "Archivo no encontrado" }; return;
        }

        // Permiso: técnico o dueño de la solicitud
        const solicitud = await new SolicitudModel().SeleccionarPorId(solicitudId);
        if (!solicitud) { response.status = 404; response.body = { success: false, message: "Solicitud no encontrada" }; return; }
        const esTecnico = payload.rol === "Tecnico";
        const esDueno = solicitud.usuario_id === Number(payload.id);
        if (!esTecnico && !esDueno) {
            response.status = 403;
            response.body = { success: false, message: "No tienes acceso a este archivo" };
            return;
        }

        // Verificar existencia física del archivo
        const nombre = nombreDesdeRuta(archivo.ruta_archivo);
        const rutaFisica = `${config.upload.dir}/solicitudes/${nombre}`;
        try {
            const bytes = await Deno.readFile(rutaFisica);
            response.status = 200;
            response.headers.set("Content-Type", archivo.tipo_archivo);
            response.headers.set("Content-Disposition", `attachment; filename="${archivo.nombre_archivo.replace(/["\\]/g, "")}"`);
            response.headers.set("Content-Length", String(bytes.length));
            response.body = bytes;
        } catch {
            response.status = 404;
            response.body = { success: false, message: "El archivo no existe físicamente en el servidor" };
        }
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al descargar el archivo" };
        console.error("[descargarArchivo]", String(error));
    }
};
