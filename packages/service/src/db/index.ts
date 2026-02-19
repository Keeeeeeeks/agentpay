import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

const connectionString = process.env["DATABASE_URL"] ?? "postgres://localhost:5432/agentpay";

const client = postgres(connectionString, {
  prepare: false,
});

export const db = drizzle(client, { schema });

export { client };
export * from "./schema.js";
