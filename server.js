// server.js
import express from "express";
import compression from "compression";
import { createRequestHandler } from "@remix-run/express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Optional: Trust proxy if behind Cloudflare or similar
app.set("trust proxy", 1);

app.use(compression());
app.use(express.static("public"));

app.all(
  "*",
  createRequestHandler({
    build: await import("./build/index.js"),
    mode: process.env.NODE_ENV,
  })
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ App listening on port ${port}`);
});