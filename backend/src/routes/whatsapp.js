import { Router } from "express";
import { initWhatsApp, getWhatsAppState, logoutWhatsApp } from "../whatsapp/client.js";

const router = Router();

// GET /api/whatsapp/status
// Poll this from the frontend to show connection state + QR code
router.get("/status", (req, res) => {
  const state = getWhatsAppState();
  res.json(state);
});

// POST /api/whatsapp/connect
// Starts the WhatsApp client (generates QR if not authenticated)
router.post("/connect", (req, res) => {
  initWhatsApp();
  res.json({ ok: true, state: getWhatsAppState() });
});

// POST /api/whatsapp/logout
router.post("/logout", async (req, res) => {
  await logoutWhatsApp();
  res.json({ ok: true });
});

export default router;
