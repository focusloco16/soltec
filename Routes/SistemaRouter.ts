import { Router } from "../Dependencies/Dependecias.ts";
import { health, testEmail } from "../Controller/SistemaController.ts";

const SistemaRouter = new Router();
SistemaRouter.get("/api/health", health);
SistemaRouter.post("/api/test-email", testEmail);

export { SistemaRouter };
