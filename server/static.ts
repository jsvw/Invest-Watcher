import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import compression from "compression";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(compression());

  app.use(express.static(distPath, {
    maxAge: '1y',
    etag: true,
    immutable: true,
    index: false,
  }));

  app.use("*", (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
