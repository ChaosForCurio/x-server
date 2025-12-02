import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import postRoutes from "./routes/postRoutes";
import { initDB } from "./services/dbService";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const msg = `[${new Date().toISOString()}] ${req.method} ${req.url}`;
  console.log(msg);
  try {
    const fs = require("fs");
    const path = require("path");
    const logFile = path.resolve(__dirname, "../server-error.log");
    fs.appendFileSync(logFile, msg + "\n");
  } catch (e) {
    // ignore
  }
  next();
});

// Lazy DB initialization for serverless environments
let dbInitialized = false;
app.use(async (req, res, next) => {
  if (!dbInitialized) {
    await initDB();
    dbInitialized = true;
  }
  next();
});

app.use("/api/posts", postRoutes);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({ error: "Internal Server Error (Global)" });
});

// Only listen if run directly (not when imported by Vercel)
if (require.main === module) {
  app.listen(PORT, async () => {
    await initDB(); // Ensure DB is ready for local dev
    dbInitialized = true;
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
