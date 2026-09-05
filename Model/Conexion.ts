import { Client } from "../Dependencies/Dependecias.ts";
import { config } from "../config/config.ts";

export let conexion: Client;

export async function conectarBaseDatos(): Promise<Client> {
    if (conexion) return conexion;
    conexion = await new Client().connect({
        hostname: config.db.host,
        port: config.db.port,
        username: config.db.user,
        password: config.db.password,
        db: config.db.name,
        charset: "utf8mb4",
    });
    return conexion;
}
