import { Router } from "express";
import {
  getPaymentType,
  getPaymentTypes,
  createPaymentType,
  updatePaymentType,
  deletePaymentType,
} from "../controllers/PaymentsType.controllers.js";
import verifyToken from "../middlewares/verifyToken.js";

const router = Router();

router.get("/", verifyToken, getPaymentTypes);
router.get("/:id", verifyToken, getPaymentType);
router.post("/", verifyToken, createPaymentType);
router.put("/:id", verifyToken, updatePaymentType);
router.delete("/:id", verifyToken, deletePaymentType);

export default router;
