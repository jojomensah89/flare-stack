import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { UserInputError } from "./model";

export interface AvailableSkill {
  id: string;
  name: string;
  description: string;
  category: "logging" | "design" | "animation";
  sourceUrl: string;
  tableRow: {
    domain: string;
    purpose: string;
  };
  recommended: boolean;
}

export const AVAILABLE_SKILLS: Record<string, AvailableSkill> = {
  "review-logging-patterns": {
    id: "review-logging-patterns",
    name: "Review Logging Patterns",
    description: "Audit code for logging best practices, wide events, and evlog adoption",
    category: "logging",
    sourceUrl: "https://www.evlog.dev/.well-known/skills/review-logging-patterns/SKILL.md",
    tableRow: {
      domain: "**Logging review & patterns**",
      purpose: "Auditing code for logging best practices, wide events, and evlog adoption",
    },
    recommended: true,
  },
  "analyze-logs": {
    id: "analyze-logs",
    name: "Analyze Logs",
    description: "Analyze NDJSON log events in `.evlog/logs/` to diagnose errors and latencies",
    category: "logging",
    sourceUrl: "https://www.evlog.dev/.well-known/skills/analyze-logs/SKILL.md",
    tableRow: {
      domain: "**Log analysis & debugging**",
      purpose: "Analyzing NDJSON log events in `.evlog/logs/` to diagnose errors and latencies",
    },
    recommended: true,
  },
  "emil-design-eng": {
    id: "emil-design-eng",
    name: "Emil Design Engineering",
    description: "UI polish, component craftsmanship, animation philosophy, and micro-details",
    category: "design",
    sourceUrl:
      "https://raw.githubusercontent.com/emilkowalski/skills/main/skills/emil-design-eng/SKILL.md",
    tableRow: {
      domain: "**Design engineering & craft**",
      purpose: "UI polish, component craftsmanship, animation philosophy, and micro-details",
    },
    recommended: true,
  },
  "better-ui": {
    id: "better-ui",
    name: "Better UI",
    description: "Concentric borders, surface depth, hit areas, optical alignment, and contrast",
    category: "design",
    sourceUrl:
      "https://raw.githubusercontent.com/jakubkrehel/skills/main/skills/better-ui/SKILL.md",
    tableRow: {
      domain: "**Visual polish & accessibility**",
      purpose: "Concentric borders, surface depth, hit areas, optical alignment, and contrast",
    },
    recommended: true,
  },
  "pick-ui-library": {
    id: "pick-ui-library",
    name: "Pick UI Library",
    description: "Curated recommendations for charts, command menus, toasts, virtualization",
    category: "design",
    sourceUrl:
      "https://raw.githubusercontent.com/emilkowalski/skills/main/skills/pick-ui-library/SKILL.md",
    tableRow: {
      domain: "**Selecting UI libraries**",
      purpose: "Curated recommendations for charts, command menus, toasts, virtualization",
    },
    recommended: true,
  },
  "find-animation-opportunities": {
    id: "find-animation-opportunities",
    name: "Find Animation Opportunities",
    description: "Identifying static UI areas that would benefit from subtle motion",
    category: "animation",
    sourceUrl:
      "https://raw.githubusercontent.com/emilkowalski/skills/main/skills/find-animation-opportunities/SKILL.md",
    tableRow: {
      domain: "**Finding animation spots**",
      purpose: "Identifying static UI areas that would benefit from subtle motion",
    },
    recommended: true,
  },
  "improve-animations": {
    id: "improve-animations",
    name: "Improve Animations",
    description: "Auditing and tuning animation timing, springs, and transitions",
    category: "animation",
    sourceUrl:
      "https://raw.githubusercontent.com/emilkowalski/skills/main/skills/improve-animations/SKILL.md",
    tableRow: {
      domain: "**Refining motion & physics**",
      purpose: "Auditing and tuning animation timing, springs, and transitions",
    },
    recommended: true,
  },
};

export const RECOMMENDED_SKILLS = Object.values(AVAILABLE_SKILLS)
  .filter((s) => s.recommended)
  .map((s) => s.id);

export function resolveRequestedSkills(input?: string | string[]): string[] {
  if (input === undefined || input === "recommended") {
    return [...RECOMMENDED_SKILLS];
  }
  if (input === "none") {
    return [];
  }
  if (input === "all") {
    return Object.keys(AVAILABLE_SKILLS);
  }

  const list = Array.isArray(input)
    ? input
    : input
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

  const resolved: string[] = [];
  for (const item of list) {
    if (item === "none") continue;
    if (item === "recommended") {
      for (const rec of RECOMMENDED_SKILLS) {
        if (!resolved.includes(rec)) resolved.push(rec);
      }
      continue;
    }
    if (item === "all") {
      for (const all of Object.keys(AVAILABLE_SKILLS)) {
        if (!resolved.includes(all)) resolved.push(all);
      }
      continue;
    }
    const skill = AVAILABLE_SKILLS[item];
    if (!skill) {
      throw new UserInputError(
        `Unknown skill: "${item}". Available skills: ${Object.keys(AVAILABLE_SKILLS).join(", ")}. Or use "recommended", "all", or "none".`,
      );
    }
    if (!resolved.includes(item)) resolved.push(item);
  }
  return resolved;
}

export function cleanSkillContent(raw: string): string {
  const marker = "\n---\n\n";
  const markerIdx = raw.indexOf(marker);
  if (markerIdx !== -1 && raw.startsWith("Title:")) {
    return raw.slice(markerIdx + marker.length);
  }
  return raw;
}

export type SkillFetcher = (url: string) => Promise<string>;

export async function defaultSkillFetcher(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "create-flare-stack" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`);
  }
  return await response.text();
}

export async function installSkills(
  projectDir: string,
  skillIds: string[],
  fetcher: SkillFetcher = defaultSkillFetcher,
): Promise<string[]> {
  if (skillIds.length === 0) return [];

  const installed: string[] = [];
  const skillsDir = join(projectDir, ".agents", "skills");
  await mkdir(skillsDir, { recursive: true });

  for (const id of skillIds) {
    const meta = AVAILABLE_SKILLS[id];
    if (!meta) continue;

    try {
      const rawContent = await fetcher(meta.sourceUrl);
      const cleaned = cleanSkillContent(rawContent);
      const targetDir = join(skillsDir, id);
      await mkdir(targetDir, { recursive: true });
      await writeFile(join(targetDir, "SKILL.md"), cleaned, "utf8");
      installed.push(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[warning] Failed to download skill "${id}" from ${meta.sourceUrl}: ${message}`);
    }
  }

  if (installed.length > 0) {
    await updateAgentsMarkdown(projectDir, installed);
  }

  return installed;
}

async function updateAgentsMarkdown(
  projectDir: string,
  installedSkillIds: string[],
): Promise<void> {
  const agentsPath = join(projectDir, "AGENTS.md");
  if (!existsSync(agentsPath)) return;

  const content = await readFile(agentsPath, "utf8");
  const tableHeaderIndex = content.indexOf("| Task / Domain");
  if (tableHeaderIndex === -1) return;

  const rowsToAdd: string[] = [];
  for (const id of installedSkillIds) {
    const meta = AVAILABLE_SKILLS[id];
    if (!meta) continue;
    if (content.includes(`\`${id}\``)) continue;
    const domainCol = meta.tableRow.domain.padEnd(35, " ");
    const skillCol = `\`${id}\``.padEnd(30, " ");
    rowsToAdd.push(`| ${domainCol} | ${skillCol} | ${meta.tableRow.purpose.padEnd(78, " ")} |`);
  }

  if (rowsToAdd.length === 0) return;

  const lines = content.split("\n");
  let tableDividerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.startsWith("| -----")) {
      tableDividerIdx = i;
      break;
    }
  }

  if (tableDividerIdx !== -1) {
    lines.splice(tableDividerIdx + 1, 0, ...rowsToAdd);
    await writeFile(agentsPath, lines.join("\n"), "utf8");
  }
}
