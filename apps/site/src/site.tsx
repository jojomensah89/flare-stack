import { useMemo, useState } from "react";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import {
  PRESET_CATALOG,
  VERIFIED_V0141_RELEASE_MANIFEST,
  buildScaffoldCommand,
  normalizeSelection,
  validateCatalogProjectName,
  type CatalogEntry,
  type CatalogBackend,
  type CatalogSelection,
  type NormalizedCatalogSelection,
} from "create-flare-stack/catalog";
import { Input, Label } from "@repo/ui";
import { BuilderControls, CommandPanel, TemplateTable } from "./site-components";
import { AsciiFlare } from "./ascii-flare";
import { TechStack } from "./tech-stack";

function releaseBackend(entry: CatalogEntry): CatalogBackend | undefined {
  return VERIFIED_V0141_RELEASE_MANIFEST.acceptedCombinations.find(
    (combination) => combination.id === entry.id,
  )?.backend;
}

function backendLabel(backend: CatalogBackend | undefined): string {
  switch (backend) {
    case "start-functions":
      return "TanStack Start server functions";
    case "effect-http":
      return "Effect services behind HTTP routes";
    case "hono-rpc":
      return "Hono RPC backend";
    case "hono-worker":
      return "Hono Worker";
    case "none":
      return "no backend";
    default:
      return "not included in the selected release";
  }
}

const DEFAULT_SELECTION: NormalizedCatalogSelection = {
  preset: "app",
  database: "d1",
  auth: "better-auth",
};

function entryFor(selection: NormalizedCatalogSelection): CatalogEntry | undefined {
  return PRESET_CATALOG.find(
    (entry) =>
      entry.selection.preset === selection.preset &&
      entry.selection.frontend === selection.frontend &&
      entry.selection.database === selection.database &&
      entry.selection.auth === selection.auth,
  );
}

function stackDescription(entry: CatalogEntry): string {
  const { runtime, frontend, database, authentication, tooling } = entry.stack;
  const selectedBackend = releaseBackend(entry);
  const describedBackend = selectedBackend
    ? backendLabel(selectedBackend)
    : "not included in v0.14.1";
  return [runtime, frontend, describedBackend, authentication, database, tooling.join(" + ")]
    .filter(Boolean)
    .join(" · ");
}

function selectOrNormalize(
  current: NormalizedCatalogSelection,
  patch: Partial<CatalogSelection>,
): NormalizedCatalogSelection {
  const next = { ...current, ...patch };
  if (next.preset !== "fullstack") delete next.frontend;
  if (next.preset === "extension") next.database = "none";
  if (next.preset === "worker" || next.preset === "extension" || next.database === "none") {
    next.auth = "none";
  }
  return normalizeSelection(next);
}

export function Site() {
  const [selection, setSelection] = useState(DEFAULT_SELECTION);
  const [projectName, setProjectName] = useState("my-app");
  const [filter, setFilter] = useState("");
  const [copyState, setCopyState] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const [commandError, setCommandError] = useState("");
  const entry = entryFor(selection);
  const projectNameValidation = useMemo(
    () => validateCatalogProjectName(projectName, selection.preset),
    [projectName, selection.preset],
  );

  const result = useMemo(() => {
    if (!projectNameValidation.valid) {
      return {
        command: "",
        available: false,
        reason: projectNameValidation.message ?? "Enter a valid project name.",
      };
    }
    try {
      return buildScaffoldCommand(selection, projectName, {
        mode: "release",
        manifest: VERIFIED_V0141_RELEASE_MANIFEST,
      });
    } catch (error) {
      return {
        command: "",
        available: false,
        reason: error instanceof Error ? error.message : "Enter a valid project name.",
      };
    }
  }, [selection, projectName, projectNameValidation]);

  const normalizedRows = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return PRESET_CATALOG.filter((candidate) => {
      const text =
        `${candidate.label} ${candidate.id} ${stackDescription(candidate)}`.toLocaleLowerCase();
      return !query || text.includes(query);
    });
  }, [filter]);

  function updateSelection(patch: Partial<CatalogSelection>) {
    const before = selection;
    const next = selectOrNormalize(selection, patch);
    setSelection(next);
    setCopyState("");
    setCommandError("");
    const changed = Object.keys(patch).some(
      (key) =>
        before[key as keyof NormalizedCatalogSelection] !==
        next[key as keyof NormalizedCatalogSelection],
    );
    setSelectionNotice(
      changed
        ? `Selection updated to ${next.preset}${next.frontend === "router" ? ", Router" : ""}, ${next.database}, ${next.auth === "better-auth" ? "Better Auth" : "no auth"}.`
        : "",
    );
  }

  async function copyCommand() {
    if (!result.available || !result.command) return;
    try {
      await navigator.clipboard.writeText(result.command);
      setCopyState("Command copied.");
      setCommandError("");
    } catch {
      setCopyState("");
      setCommandError("Clipboard access failed. Select the command and copy it manually.");
    }
  }

  const isReleaseAvailable = entry
    ? VERIFIED_V0141_RELEASE_MANIFEST.acceptedCombinations.some(
        (combination) => combination.id === entry.id,
      )
    : false;
  const backendDescription = isReleaseAvailable
    ? `The published v0.14.1 release uses ${backendLabel(entry ? releaseBackend(entry) : undefined)}.`
    : "This combination is not included in the published v0.14.1 release yet.";

  return (
    <div id="top" className="site-shell bg-background text-foreground">
      <header className="site-width flex items-center justify-between gap-6 py-6">
        <a href="#top" className="site-wordmark" aria-label="Flare Stack home">
          <span aria-hidden="true" className="site-mark">
            *
          </span>{" "}
          Flare Stack
        </a>
        <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm sm:gap-8">
          <a className="site-link" href="#presets">
            Build a stack
          </a>
          <a className="site-link hidden sm:inline-flex" href="#templates">
            All templates
          </a>
          <a
            className="site-link inline-flex items-center gap-1"
            href="https://github.com/jojomensah89/flare-stack"
          >
            GitHub <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </nav>
      </header>
      <main>
        <section className="site-width site-hero">
          <div className="hero-copy">
            <h1>
              A faster start
              <br />
              on Cloudflare.
            </h1>
            <p className="hero-description">
              The tools you reach for, already wired together. Pick your stack and get a working
              project with one Bun command.
            </p>
            <a className="hero-action" href="#presets">
              Build your stack <ArrowDown size={17} aria-hidden="true" />
            </a>
          </div>
          <AsciiFlare />
        </section>
        <TechStack />
        <section id="presets" className="site-width builder-section">
          <div className="section-intro">
            <div>
              <h2>Make it your starting point.</h2>
              <p>Choose a published stack and copy its Bun command.</p>
            </div>
            <a className="site-accent-link" href="#templates">
              Explore all 19 combinations <ArrowDown size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="builder-workbench" data-ui>
            <BuilderControls
              selection={selection}
              projectName={projectName}
              projectNameValidation={projectNameValidation}
              onProjectNameChange={(value) => {
                setProjectName(value);
                setCopyState("");
                setCommandError("");
              }}
              onSelectionChange={updateSelection}
            />
            <div className="builder-result">
              <section aria-labelledby="summary-heading" className="stack-summary">
                <h3 id="summary-heading">Your stack</h3>
                <p className="stack-frontend">{entry?.stack.frontend}</p>
                <dl className="stack-facts">
                  <div>
                    <dt>Runtime</dt>
                    <dd>{entry?.stack.runtime}</dd>
                  </div>
                  <div>
                    <dt>Database</dt>
                    <dd>{entry?.stack.database}</dd>
                  </div>
                  <div>
                    <dt>Auth</dt>
                    <dd>{entry?.stack.authentication}</dd>
                  </div>
                </dl>
                <details className="stack-tools">
                  <summary>Tools included</summary>
                  <p>{entry?.stack.tooling.join(" · ")}</p>
                </details>
                <p className="stack-note">{backendDescription}</p>
              </section>
              <CommandPanel
                result={result}
                copyState={copyState}
                commandError={commandError}
                onCopy={() => void copyCommand()}
              />
            </div>
          </div>
        </section>
        <section id="templates" className="site-width templates-section">
          <div className="section-intro">
            <div>
              <h2>A shape for your next idea.</h2>
              <p>One app, a separate backend, a Worker, or an extension.</p>
            </div>
            <div className="template-search">
              <Label htmlFor="template-filter" className="sr-only">
                Filter templates
              </Label>
              <Input
                id="template-filter"
                type="search"
                placeholder="Find a template…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
          </div>
          <TemplateTable
            rows={normalizedRows}
            currentEntryId={entry?.id}
            selectionNotice={selectionNotice}
            stackDescription={stackDescription}
            onSelect={updateSelection}
          />
        </section>
        <section className="site-width setup-section" id="setup">
          <h2>Then, make it yours.</h2>
          <div className="setup-copy">
            <p>
              Run the command in your terminal. Flare creates your project, installs its
              dependencies, and checks that it builds.
            </p>
            <p>
              Your generated README covers local development, environment variables, and the path to
              Cloudflare.
            </p>
          </div>
        </section>
      </main>
      <footer className="site-width site-footer">
        <span>Flare Stack. A head start, kept simple.</span>
        <a className="site-accent-link" href="https://github.com/jojomensah89/flare-stack">
          Made to be made yours <ArrowUpRight size={15} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
}
