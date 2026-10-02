// @ts-nocheck
import { defineConfig } from "drizzle-kit";
import process from "node:process";

export default defineConfig({
  schema: "./src/neon/schema/index.ts",
  out: "./src/neon/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
