#!/usr/bin/env bun
import { runLocalSetup } from "flare";

runLocalSetup({ startDirectory: process.cwd() }).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
