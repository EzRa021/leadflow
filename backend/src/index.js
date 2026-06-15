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

// Allow all origins — no CORS errors from any frontend domain
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Handle preflight requests for all routes
app.options("*", cors());

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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 LeadFlow backend running on http://0.0.0.0:${PORT}`);
  console.log("📲 Starting WhatsApp client...");
  initWhatsApp();
});
