import { createFileRoute } from "@tanstack/react-router";
import { Site } from "../site";

export const Route = createFileRoute("/")({ component: Site });
