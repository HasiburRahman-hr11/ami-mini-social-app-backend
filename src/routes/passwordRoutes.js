
import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  forgotPassword,
  resetPassword,
} from "../controllers/passwordController.js";

const router = Router();

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post("/forgot", passwordResetLimiter, forgotPassword);
router.post("/reset", passwordResetLimiter, resetPassword);

export default router;
