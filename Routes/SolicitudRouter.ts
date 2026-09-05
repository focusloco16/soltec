import { Router } from "../Dependencies/Dependecias.ts";
import { listar, obtenerPorId, crear, cambiarEstado, asignarTecnico, descargarArchivo } from "../Controller/SolicitudController.ts";
import { authMiddleware, tecnicoMiddleware } from "../Middlewares/AuthMiddleware.ts";

const SolicitudRouter = new Router();
SolicitudRouter.get("/api/solicitudes", authMiddleware, listar);
SolicitudRouter.post("/api/solicitudes", authMiddleware, crear);
SolicitudRouter.get("/api/solicitudes/:id", authMiddleware, obtenerPorId);
SolicitudRouter.patch("/api/solicitudes/:id/estado", authMiddleware, tecnicoMiddleware, cambiarEstado);
SolicitudRouter.patch("/api/solicitudes/:id/asignar", authMiddleware, tecnicoMiddleware, asignarTecnico);
SolicitudRouter.get("/api/solicitudes/:id/archivos/:archivoId/download", authMiddleware, descargarArchivo);

export { SolicitudRouter };
