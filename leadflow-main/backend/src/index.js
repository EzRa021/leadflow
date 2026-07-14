import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import importRoutes from "./routes/import.js";
import leadsRoutes from "./routes/leads.js";
import whatsappRoutes from "./routes/whatsapp.js";
import sendRoutes, { resumeIncompleteJobs } from "./routes/send.js";
import templatesRoutes from "./routes/templates.js";
import inboxRoutes from "./routes/inbox.js";
import viewsRoutes from "./routes/views.js";
import { initWhatsApp } from "./client.js";
import { closeJobCancelBridge } from "./lib/realtime.js";

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
app.use("/api/inbox", inboxRoutes);
app.use("/api/views", viewsRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  // If the response already started streaming, we can't change the status —
  // hand off to Express's default handler to close the socket.
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

// Last-resort logging so a stray rejection/exception is visible in logs
// instead of silently killing (or not killing) the process.
process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[process] uncaughtException:", err);
});

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 LeadFlow backend running on http://0.0.0.0:${PORT}`);
  console.log("📲 Starting WhatsApp client...");
  initWhatsApp();
  resumeIncompleteJobs();
});

// Graceful shutdown — unsubscribe the Supabase realtime channel (otherwise it
// leaks across hot-reloads/redeploys) and stop accepting new connections.
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  closeJobCancelBridge();
  server.close(() => process.exit(0));
  // Don't hang forever if a connection won't drain.
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
