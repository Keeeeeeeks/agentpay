#!/usr/bin/env node
import { startServer } from "../src/index.js";

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
