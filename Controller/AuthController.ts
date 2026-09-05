import { Context, RouterContext } from "../Dependencies/Dependecias.ts";
import { UsuarioModel } from "../Model/UsuarioModel.ts";
import { hashClave, verificarClave, esHashNuevo } from "../Helpers/Password.ts";
import { crearToken } from "../Helpers/Jwt.ts";
import { config, FOTO_TIPOS } from "../config/config.ts";
import { generarNombreUnico, mimeFotoValido, tamanoValido } from "../Helpers/ArchivoHelper.ts";

// Usuario sin datos sensibles (con foto si la tiene)
function usuarioPublico(u: {
    id: number | null; nombres: string; apellidos: string; email: string; rol: string;
    foto_perfil?: string | null; foto_tipo?: string | null; foto_ruta?: string | null;
}) {
    return {
        id: u.id,
        nombres: u.nombres,
        apellidos: u.apellidos,
        email: u.email,
        rol: u.rol,
        foto: u.foto_ruta ? { ruta: u.foto_ruta, tipo: u.foto_tipo } : null,
    };
}

// POST /api/register
export const registro = async (ctx: Context) => {
    const { response } = ctx;
    try {
        const body = await ctx.request.body.json();
        const nombres = (body.nombres || "").toString().trim();
        const apellidos = (body.apellidos || "").toString().trim();
        const email = (body.email || "").toString().trim().toLowerCase();
        const password = (body.password || "").toString();

        if (!nombres || !apellidos || !email || !password) {
            response.status = 422;
            response.body = { success: false, message: "Todos los campos son obligatorios" };
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            response.status = 422;
            response.body = { success: false, message: "Email inválido" };
            return;
        }
        if (password.length < 6) {
            response.status = 422;
            response.body = { success: false, message: "La contraseña debe tener al menos 6 caracteres" };
            return;
        }

        const obj = new UsuarioModel();
        const existente = await obj.SeleccionarPorEmail(email);
        if (existente) {
            response.status = 409;
            response.body = { success: false, message: "El email ya está registrado" };
            return;
        }

        const passwordHash = await hashClave(password);
        const id = await obj.Insertar({ nombres, apellidos, email, password: passwordHash, rol: "Usuario" });

        response.status = 201;
        response.body = { success: true, message: "Usuario registrado correctamente", data: { id } };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error interno al registrar usuario" };
        console.error("[registro]", String(error));
    }
};

// POST /api/login
export const login = async (ctx: Context) => {
    const { response } = ctx;
    try {
        const body = await ctx.request.body.json();
        const email = (body.email || "").toString().trim().toLowerCase();
        const password = (body.password || "").toString();

        if (!email || !password) {
            response.status = 422;
            response.body = { success: false, message: "Email y contraseña son obligatorios" };
            return;
        }

        const obj = new UsuarioModel();
        const usuario = await obj.SeleccionarPorEmail(email);
        if (!usuario) {
            response.status = 404;
            response.body = { success: false, message: "Usuario no encontrado" };
            return;
        }

        const coincide = await verificarClave(password, usuario.password ?? "");
        if (!coincide) {
            response.status = 401;
            response.body = { success: false, message: "Contraseña incorrecta" };
            return;
        }

        // Si el usuario tenía hash antiguo (SHA-256 sin salt), se re-hashea a PBKDF2
        if (!esHashNuevo(usuario.password ?? "")) {
            const nuevoHash = await hashClave(password);
            await obj.ActualizarDatos(usuario.id!, { password: nuevoHash });
        }

        const token = await crearToken({
            id: usuario.id,
            nombres: usuario.nombres,
            apellidos: usuario.apellidos,
            email: usuario.email,
            rol: usuario.rol,
        });

        response.status = 200;
        response.body = {
            success: true,
            token,
            user: usuarioPublico(usuario),
        };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error interno al iniciar sesión" };
        console.error("[login]", String(error));
    }
};

// GET /api/profile
export const obtenerPerfil = async (ctx: Context) => {
    const { response } = ctx;
    const payload = ctx.state.usuario as Record<string, unknown>;
    try {
        const usuario = await new UsuarioModel().SeleccionarPorId(Number(payload.id));
        if (!usuario) { response.status = 404; response.body = { success: false, message: "Usuario no encontrado" }; return; }
        response.status = 200;
        response.body = { success: true, user: usuarioPublico(usuario) };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al obtener el perfil" };
        console.error("[perfil]", String(error));
    }
};

// PUT /api/profile
export const actualizarPerfil = async (ctx: Context) => {
    const { response } = ctx;
    const payload = ctx.state.usuario as Record<string, unknown>;
    try {
        const body = await ctx.request.body.json();
        const datos: { nombres?: string; apellidos?: string; email?: string } = {};

        if (body.nombres !== undefined) datos.nombres = body.nombres.toString().trim();
        if (body.apellidos !== undefined) datos.apellidos = body.apellidos.toString().trim();
        if (body.email !== undefined) {
            const email = body.email.toString().trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                response.status = 422;
                response.body = { success: false, message: "Email inválido" };
                return;
            }
            // Verificar que el email no pertenezca a otro usuario
            const obj = new UsuarioModel();
            const otro = await obj.SeleccionarPorEmail(email);
            if (otro && otro.id !== Number(payload.id)) {
                response.status = 409;
                response.body = { success: false, message: "El email ya está en uso" };
                return;
            }
            datos.email = email;
        }

        await new UsuarioModel().ActualizarDatos(Number(payload.id), datos);
        const usuario = await new UsuarioModel().SeleccionarPorId(Number(payload.id));
        response.status = 200;
        response.body = { success: true, message: "Perfil actualizado", user: usuarioPublico(usuario!) };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al actualizar el perfil" };
        console.error("[actualizarPerfil]", String(error));
    }
};

// POST /api/profile/photo
export const subirFotoPerfil = async (ctx: Context) => {
    const { response } = ctx;
    const payload = ctx.state.usuario as Record<string, unknown>;
    try {
        const form = await ctx.request.body.formData();
        const archivo = form.get("foto") as File | null;

        if (!archivo || archivo.size === 0) {
            response.status = 422;
            response.body = { success: false, message: "Debe enviar una imagen en el campo 'foto'" };
            return;
        }
        if (!tamanoValido(archivo.size)) {
            response.status = 413;
            response.body = { success: false, message: `La imagen excede el tamaño máximo (${config.upload.maxFileSize} bytes)` };
            return;
        }
        const tipo = archivo.type;
        if (!mimeFotoValido(tipo)) {
            response.status = 422;
            response.body = { success: false, message: "Tipo de imagen no permitido. Use JPG, PNG o WEBP", tiposPermitidos: FOTO_TIPOS };
            return;
        }

        const dirFotos = `${config.upload.dir}/perfiles`;
        await Deno.mkdir(dirFotos, { recursive: true });

        const nombreGuardado = generarNombreUnico(archivo.name);
        const bytes = new Uint8Array(await archivo.arrayBuffer());
        await Deno.writeFile(`${dirFotos}/${nombreGuardado}`, bytes);

        const rutaAlmacenada = `/uploads/perfiles/${nombreGuardado}`;
        await new UsuarioModel().ActualizarFoto(Number(payload.id), {
            nombre: archivo.name,
            tipo,
            ruta: rutaAlmacenada,
        });

        const usuario = await new UsuarioModel().SeleccionarPorId(Number(payload.id));
        response.status = 200;
        response.body = {
            success: true,
            message: "Foto de perfil actualizada",
            user: usuarioPublico(usuario!),
        };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al subir la foto de perfil" };
        console.error("[subirFotoPerfil]", String(error));
    }
};

// DELETE /api/profile/photo
export const quitarFotoPerfil = async (ctx: Context) => {
    const { response } = ctx;
    const payload = ctx.state.usuario as Record<string, unknown>;
    try {
        await new UsuarioModel().QuitarFoto(Number(payload.id));
        const usuario = await new UsuarioModel().SeleccionarPorId(Number(payload.id));
        response.status = 200;
        response.body = {
            success: true,
            message: "Foto de perfil eliminada",
            user: usuarioPublico(usuario!),
        };
    } catch (error) {
        response.status = 500;
        response.body = { success: false, message: "Error al eliminar la foto de perfil" };
        console.error("[quitarFotoPerfil]", String(error));
    }
};
