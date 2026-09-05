import { conectarBaseDatos } from "./Conexion.ts";

export interface SolicitudData {
    id: number | null;
    usuario_id: number;
    tecnico_id: number | null;
    asunto: string;
    descripcion: string;
    prioridad: "Baja" | "Media" | "Alta" | "Critica";
    estado: "Pendiente" | "En proceso" | "En espera" | "Solucionada" | "Cerrada";
    fecha_creacion?: string;
    fecha_actualizacion?: string;
}

export interface SolicitudLista extends SolicitudData {
    nombre_usuario: string;
    apellido_usuario: string;
    email_usuario: string;
    nombre_tecnico: string | null;
}

export interface ResultadoPaginado {
    data: SolicitudLista[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export class SolicitudModel {
    private async db() {
        return conectarBaseDatos();
    }

    public async SeleccionarTodasPaginado(opciones: {
        page: number;
        limit: number;
        search?: string;
        estado?: string;
        prioridad?: string;
        sort?: string;
        order?: "ASC" | "DESC";
    }): Promise<ResultadoPaginado> {
        const c = await this.db();
        const page = Math.max(1, opciones.page);
        const limit = Math.min(Math.max(1, opciones.limit), 100);
        const offset = (page - 1) * limit;

        const condiciones: string[] = [];
        const valores: unknown[] = [];

        if (opciones.search) {
            condiciones.push("(s.asunto LIKE ? OR CONCAT(u.nombres, ' ', u.apellidos) LIKE ?)");
            const termino = `%${opciones.search}%`;
            valores.push(termino, termino);
        }
        if (opciones.estado) {
            condiciones.push("s.estado = ?");
            valores.push(opciones.estado);
        }
        if (opciones.prioridad) {
            condiciones.push("s.prioridad = ?");
            valores.push(opciones.prioridad);
        }

        const where = condiciones.length > 0 ? `WHERE ${condiciones.join(" AND ")}` : "";

        // Columnas permitidas para ordenar (evitar inyección SQL)
        const columnasValidas: Record<string, string> = {
            id: "s.id",
            asunto: "s.asunto",
            prioridad: "s.prioridad",
            estado: "s.estado",
            fecha_creacion: "s.fecha_creacion",
            usuario: "u.nombres",
        };
        const ordenCol = columnasValidas[opciones.sort ?? "fecha_creacion"] ?? "s.fecha_creacion";
        const ordenDir = opciones.order === "ASC" ? "ASC" : "DESC";

        const base = `FROM solicitudes s INNER JOIN usuarios u ON s.usuario_id = u.id LEFT JOIN usuarios t ON s.tecnico_id = t.id`;

        const { rows: totalRows } = await c.execute(`SELECT COUNT(*) AS total ${base} ${where}`, valores);
        const total = Number((totalRows as { total: bigint }[])[0].total);

        const { rows } = await c.execute(
            `SELECT s.*, u.nombres AS nombre_usuario, u.apellidos AS apellido_usuario, u.email AS email_usuario,
                    CONCAT(t.nombres, ' ', t.apellidos) AS nombre_tecnico
             ${base} ${where} ORDER BY ${ordenCol} ${ordenDir} LIMIT ? OFFSET ?`,
            [...valores, limit, offset]
        );

        return {
            data: rows as SolicitudLista[],
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        };
    }

    public async SeleccionarPorUsuarioPaginado(usuario_id: number, opciones: {
        page: number;
        limit: number;
        search?: string;
        estado?: string;
        prioridad?: string;
        sort?: string;
        order?: "ASC" | "DESC";
    }): Promise<ResultadoPaginado> {
        // Reutiliza el paginado general pero con filtro de dueño
        const c = await this.db();
        const page = Math.max(1, opciones.page);
        const limit = Math.min(Math.max(1, opciones.limit), 100);
        const offset = (page - 1) * limit;

        const condiciones: string[] = ["s.usuario_id = ?"];
        const valores: unknown[] = [usuario_id];

        if (opciones.search) {
            condiciones.push("(s.asunto LIKE ? OR CONCAT(u.nombres, ' ', u.apellidos) LIKE ?)");
            const termino = `%${opciones.search}%`;
            valores.push(termino, termino);
        }
        if (opciones.estado) {
            condiciones.push("s.estado = ?");
            valores.push(opciones.estado);
        }
        if (opciones.prioridad) {
            condiciones.push("s.prioridad = ?");
            valores.push(opciones.prioridad);
        }

        const where = `WHERE ${condiciones.join(" AND ")}`;
        const columnasValidas: Record<string, string> = {
            id: "s.id",
            asunto: "s.asunto",
            prioridad: "s.prioridad",
            estado: "s.estado",
            fecha_creacion: "s.fecha_creacion",
            usuario: "u.nombres",
        };
        const ordenCol = columnasValidas[opciones.sort ?? "fecha_creacion"] ?? "s.fecha_creacion";
        const ordenDir = opciones.order === "ASC" ? "ASC" : "DESC";

        const base = `FROM solicitudes s INNER JOIN usuarios u ON s.usuario_id = u.id LEFT JOIN usuarios t ON s.tecnico_id = t.id`;

        const { rows: totalRows } = await c.execute(`SELECT COUNT(*) AS total ${base} ${where}`, valores);
        const total = Number((totalRows as { total: bigint }[])[0].total);

        const { rows } = await c.execute(
            `SELECT s.*, u.nombres AS nombre_usuario, u.apellidos AS apellido_usuario, u.email AS email_usuario,
                    CONCAT(t.nombres, ' ', t.apellidos) AS nombre_tecnico
             ${base} ${where} ORDER BY ${ordenCol} ${ordenDir} LIMIT ? OFFSET ?`,
            [...valores, limit, offset]
        );

        return {
            data: rows as SolicitudLista[],
            total,
            page,
            limit,
            totalPages: Math.max(1, Math.ceil(total / limit)),
        };
    }

    public async SeleccionarPorId(id: number): Promise<SolicitudLista | null> {
        const c = await this.db();
        const { rows } = await c.execute(
            `SELECT s.*, u.nombres AS nombre_usuario, u.apellidos AS apellido_usuario, u.email AS email_usuario,
                    CONCAT(t.nombres, ' ', t.apellidos) AS nombre_tecnico
             FROM solicitudes s INNER JOIN usuarios u ON s.usuario_id = u.id
             LEFT JOIN usuarios t ON s.tecnico_id = t.id WHERE s.id = ?`,
            [id]
        );
        return (rows as SolicitudLista[]).length > 0 ? (rows as SolicitudLista[])[0] : null;
    }

    public async Insertar(datos: {
        usuario_id: number;
        asunto: string;
        descripcion: string;
        prioridad: "Baja" | "Media" | "Alta" | "Critica";
    }): Promise<number> {
        const c = await this.db();
        const { lastInsertId } = await c.execute(
            "INSERT INTO solicitudes (usuario_id, asunto, descripcion, prioridad, estado) VALUES (?, ?, ?, ?, 'Pendiente')",
            [datos.usuario_id, datos.asunto, datos.descripcion, datos.prioridad]
        );
        return lastInsertId!;
    }

    public async ActualizarEstado(id: number, estado: string): Promise<void> {
        const c = await this.db();
        await c.execute("UPDATE solicitudes SET estado = ? WHERE id = ?", [estado, id]);
    }

    public async ActualizarPrioridad(id: number, prioridad: string): Promise<void> {
        const c = await this.db();
        await c.execute("UPDATE solicitudes SET prioridad = ? WHERE id = ?", [prioridad, id]);
    }

    public async AsignarTecnico(id: number, tecnico_id: number): Promise<void> {
        const c = await this.db();
        await c.execute("UPDATE solicitudes SET tecnico_id = ? WHERE id = ?", [tecnico_id, id]);
    }
}
