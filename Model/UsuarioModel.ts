import { conectarBaseDatos } from "./Conexion.ts";

export interface UsuarioData {
    id: number | null;
    nombres: string;
    apellidos: string;
    email: string;
    password?: string;
    rol: "Usuario" | "Tecnico";
    foto_perfil?: string | null;
    foto_tipo?: string | null;
    foto_ruta?: string | null;
    fecha_creacion?: string;
    fecha_actualizacion?: string;
}

export class UsuarioModel {
    private async db() {
        return conectarBaseDatos();
    }

    public async SeleccionarPorEmail(email: string): Promise<UsuarioData | null> {
        const c = await this.db();
        const { rows } = await c.execute("SELECT * FROM usuarios WHERE email = ?", [email]);
        return (rows as UsuarioData[]).length > 0 ? (rows as UsuarioData[])[0] : null;
    }

    public async SeleccionarPorId(id: number): Promise<UsuarioData | null> {
        const c = await this.db();
        const { rows } = await c.execute("SELECT * FROM usuarios WHERE id = ?", [id]);
        return (rows as UsuarioData[]).length > 0 ? (rows as UsuarioData[])[0] : null;
    }

    public async Insertar(datos: { nombres: string; apellidos: string; email: string; password: string; rol?: "Usuario" | "Tecnico" }): Promise<number> {
        const c = await this.db();
        const { lastInsertId } = await c.execute(
            "INSERT INTO usuarios (nombres, apellidos, email, password, rol) VALUES (?, ?, ?, ?, ?)",
            [datos.nombres, datos.apellidos, datos.email, datos.password, datos.rol ?? "Usuario"]
        );
        return lastInsertId!;
    }

    public async ActualizarDatos(
        id: number,
        datos: { nombres?: string; apellidos?: string; email?: string; password?: string }
    ): Promise<void> {
        const c = await this.db();
        const campos: string[] = [];
        const valores: unknown[] = [];
        if (datos.nombres !== undefined) { campos.push("nombres = ?"); valores.push(datos.nombres); }
        if (datos.apellidos !== undefined) { campos.push("apellidos = ?"); valores.push(datos.apellidos); }
        if (datos.email !== undefined) { campos.push("email = ?"); valores.push(datos.email); }
        if (datos.password !== undefined) { campos.push("password = ?"); valores.push(datos.password); }
        if (campos.length === 0) return;
        valores.push(id);
        await c.execute(`UPDATE usuarios SET ${campos.join(", ")} WHERE id = ?`, valores);
    }

    public async ActualizarFoto(
        id: number,
        foto: { nombre: string; tipo: string; ruta: string }
    ): Promise<void> {
        const c = await this.db();
        await c.execute(
            "UPDATE usuarios SET foto_perfil = ?, foto_tipo = ?, foto_ruta = ? WHERE id = ?",
            [foto.nombre, foto.tipo, foto.ruta, id]
        );
    }

    public async QuitarFoto(id: number): Promise<void> {
        const c = await this.db();
        await c.execute("UPDATE usuarios SET foto_perfil = NULL, foto_tipo = NULL, foto_ruta = NULL WHERE id = ?", [id]);
    }
}
