import { Router } from "../Dependencies/Dependecias.ts";
import { registro, login, obtenerPerfil, actualizarPerfil, subirFotoPerfil, quitarFotoPerfil } from "../Controller/AuthController.ts";
import { authMiddleware } from "../Middlewares/AuthMiddleware.ts";

const AuthRouter = new Router();
AuthRouter.post("/api/register", registro);
AuthRouter.post("/api/login", login);
AuthRouter.get("/api/profile", authMiddleware, obtenerPerfil);
AuthRouter.put("/api/profile", authMiddleware, actualizarPerfil);
AuthRouter.post("/api/profile/photo", authMiddleware, subirFotoPerfil);
AuthRouter.delete("/api/profile/photo", authMiddleware, quitarFotoPerfil);

export { AuthRouter };
