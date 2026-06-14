import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import importRoutes from "./routes/import.js";
import leadsRoutes from "./routes/leads.js";
import whatsappRoutes from "./routes/whatsapp.js";
import sendRoutes from "./routes/send.js";
import templatesRoutes from "./routes/templates.js";
import { initWhatsApp } from "./whatsapp/client.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  }),
);
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/leads", leadsRoutes);
app.use("/api/leads", importRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/send", sendRoutes);
app.use("/api/templates", templatesRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 LeadFlow backend running on http://localhost:${PORT}`);

  // Auto-connect to WhatsApp as soon as the server starts, so the client
  // is already authenticating (or ready) before the frontend even loads.
  // The frontend's WhatsAppAutoConnect just polls /api/whatsapp/status
  // and reflects whatever state this produces in real time.
  console.log("📲 Starting WhatsApp client...");
  initWhatsApp();
});
