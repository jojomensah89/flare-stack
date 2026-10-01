#!/usr/bin/env bun
import { runLocalSetup } from "flare";

try {
  await runLocalSetup({ startDirectory: process.cwd() });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
