import type { AppType } from "@repo/server/contract";
import { hc } from "hono/client";

// In the fullstack architecture, browser requests go to the same origin /api/*
export const apiClient = hc<AppType>("/");
