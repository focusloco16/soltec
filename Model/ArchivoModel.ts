import { conectarBaseDatos } from "./Conexion.ts";

export interface ArchivoData {
    id: number | null;
    solicitud_id: number;
    nombre_archivo: string;
    ruta_archivo: string;
    tipo_archivo: string;
    fecha_subida?: string;
}

export class ArchivoModel {
    private async db() {
        return conectarBaseDatos();
    }

    public async Insertar(datos: { solicitud_id: number; nombre_archivo: string; ruta_archivo: string; tipo_archivo: string }): Promise<number> {
        const c = await this.db();
        const { lastInsertId } = await c.execute(
            "INSERT INTO archivos (solicitud_id, nombre_archivo, ruta_archivo, tipo_archivo) VALUES (?, ?, ?, ?)",
            [datos.solicitud_id, datos.nombre_archivo, datos.ruta_archivo, datos.tipo_archivo]
        );
        return lastInsertId!;
    }

    public async SeleccionarPorSolicitud(solicitud_id: number): Promise<ArchivoData[]> {
        const c = await this.db();
        const { rows } = await c.execute("SELECT * FROM archivos WHERE solicitud_id = ?", [solicitud_id]);
        return rows as ArchivoData[];
    }

    public async SeleccionarPorId(id: number): Promise<ArchivoData | null> {
        const c = await this.db();
        const { rows } = await c.execute("SELECT * FROM archivos WHERE id = ?", [id]);
        return (rows as ArchivoData[]).length > 0 ? (rows as ArchivoData[])[0] : null;
    }
}
