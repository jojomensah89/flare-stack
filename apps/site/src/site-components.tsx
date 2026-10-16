import { Check, Clipboard } from "lucide-react";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui";
import {
  PRESET_CATALOG,
  VERIFIED_V0141_RELEASE_MANIFEST,
  type CatalogEntry,
  type CatalogSelection,
  type NormalizedCatalogSelection,
} from "create-flare-stack/catalog";

type SourceMode = "release" | "local";
type ProjectNameValidation = { valid: boolean; message?: string };
type CommandResult = { command?: string; available: boolean; reason?: string };

interface BuilderControlsProps {
  selection: NormalizedCatalogSelection;
  projectName: string;
  projectNameValidation: ProjectNameValidation;
  source: SourceMode;
  onProjectNameChange: (value: string) => void;
  onSelectionChange: (patch: Partial<CatalogSelection>) => void;
  onSourceChange: (value: SourceMode) => void;
}

export function BuilderControls({
  selection,
  projectName,
  projectNameValidation,
  source,
  onProjectNameChange,
  onSelectionChange,
  onSourceChange,
}: BuilderControlsProps) {
  return (
    <form
      className="builder-controls"
      onSubmit={(event) => event.preventDefault()}
      aria-label="Template options"
    >
      <div className="project-name-control space-y-2">
        <Label htmlFor="project-name">Project name</Label>
        <Input
          id="project-name"
          name="projectName"
          autoComplete="off"
          value={projectName}
          onChange={(event) => onProjectNameChange(event.target.value)}
          aria-invalid={!projectNameValidation.valid}
          aria-describedby={
            !projectNameValidation.valid ? "project-name-error" : "project-name-help"
          }
        />
        {!projectNameValidation.valid ? (
          <p id="project-name-error" className="text-sm text-destructive">
            {projectNameValidation.message}
          </p>
        ) : (
          <p id="project-name-help" className="sr-only">
            Use a name your terminal can create as a folder.
          </p>
        )}
      </div>
      <Choice
        label="Project shape"
        value={selection.preset}
        onChange={(value) => onSelectionChange({ preset: value as CatalogSelection["preset"] })}
        options={[
          ["app", "Single app"],
          ["fullstack", "Fullstack"],
          ["worker", "Worker"],
          ["extension", "Extension"],
        ]}
      />
      {selection.preset === "fullstack" && (
        <Choice
          label="Frontend"
          value={selection.frontend ?? "start"}
          onChange={(value) =>
            onSelectionChange({ frontend: value as CatalogSelection["frontend"] })
          }
          options={[
            ["start", "TanStack Start"],
            ["router", "TanStack Router SPA"],
          ]}
        />
      )}
      {selection.preset !== "extension" && (
        <Choice
          label="Database"
          value={selection.database}
          onChange={(value) =>
            onSelectionChange({ database: value as CatalogSelection["database"] })
          }
          options={[
            ["none", "None"],
            ["d1", "Cloudflare D1"],
            ["neon", "Neon"],
          ]}
        />
      )}
      {selection.preset !== "worker" && selection.preset !== "extension" && (
        <Choice
          label="Authentication"
          value={selection.auth}
          onChange={(value) => onSelectionChange({ auth: value as CatalogSelection["auth"] })}
          options={[
            ["none", "None"],
            ["better-auth", "Better Auth"],
          ]}
          disabled={selection.database === "none"}
          hint={
            selection.database === "none" ? "Choose a database to enable Better Auth." : undefined
          }
        />
      )}
      <div className="source-control space-y-2">
        <Choice
          label="Command source"
          value={source}
          onChange={(value) => onSourceChange(value as SourceMode)}
          options={[
            ["release", "Published release"],
            ["local", "Local checkout"],
          ]}
          hint="Published commands match a released artifact. Local checkout commands work from the Flare Stack source checkout."
        />
      </div>
    </form>
  );
}

interface CommandPanelProps {
  source: SourceMode;
  result: CommandResult;
  projectNameValidation: ProjectNameValidation;
  isReleaseAvailable: boolean;
  copyState: string;
  commandError: string;
  onCopy: () => void;
  onUseLocal: () => void;
}

export function CommandPanel({
  source,
  result,
  projectNameValidation,
  isReleaseAvailable,
  copyState,
  commandError,
  onCopy,
  onUseLocal,
}: CommandPanelProps) {
  return (
    <section aria-labelledby="command-heading" className="command-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="command-heading" className="font-medium">
          Scaffolding command
        </h3>
        <span className="text-xs text-muted-foreground">
          {source === "release" ? "Published release" : "Local checkout"}
        </span>
      </div>
      {result.available && result.command ? (
        <>
          <pre className="overflow-auto font-mono">
            <code>{result.command}</code>
          </pre>
          <Button className="min-w-40" onClick={onCopy} aria-label="Copy command">
            {copyState ? (
              <Check aria-hidden="true" size={16} />
            ) : (
              <Clipboard aria-hidden="true" size={16} />
            )}{" "}
            {copyState ? "Copied" : "Copy command"}
          </Button>
        </>
      ) : (
        <div className="command-unavailable space-y-4">
          <p>
            {result.reason ?? "This combination is not available from the selected command source."}
          </p>
          {source === "release" && projectNameValidation.valid && !isReleaseAvailable && (
            <Button variant="outline" onClick={onUseLocal}>
              Use local checkout
            </Button>
          )}
        </div>
      )}
      <p role="status" aria-live="polite" className="command-feedback">
        {copyState || commandError}
      </p>
      {commandError && result.command && (
        <code className="select-all break-all text-sm">{result.command}</code>
      )}
    </section>
  );
}

interface TemplateTableProps {
  rows: CatalogEntry[];
  currentEntryId?: string;
  source: SourceMode;
  selectionNotice: string;
  stackDescription: (entry: CatalogEntry, source?: SourceMode) => string;
  onSelect: (selection: CatalogSelection) => void;
}

export function TemplateTable({
  rows,
  currentEntryId,
  source,
  selectionNotice,
  stackDescription,
  onSelect,
}: TemplateTableProps) {
  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {selectionNotice}
      </p>
      <div className="template-table-wrap">
        <table className="template-table">
          <caption className="sr-only">
            {PRESET_CATALOG.length} valid Flare Stack combinations
          </caption>
          <thead className="text-sm">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Template
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Frontend
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Database
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Auth
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Source
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Select</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((candidate) => (
              <TemplateRow
                key={candidate.id}
                candidate={candidate}
                current={candidate.id === currentEntryId}
                source={source}
                stackDescription={stackDescription}
                onSelect={onSelect}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                  No templates match that filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="template-count" role="status" aria-live="polite">
        Showing {rows.length} of {PRESET_CATALOG.length} supported combinations.
      </p>
    </>
  );
}

function TemplateRow({
  candidate,
  current,
  source,
  stackDescription,
  onSelect,
}: {
  candidate: CatalogEntry;
  current: boolean;
  source: SourceMode;
  stackDescription: TemplateTableProps["stackDescription"];
  onSelect: TemplateTableProps["onSelect"];
}) {
  const label = current ? `${candidate.label}, current selection` : candidate.label;
  return (
    <tr data-selected={current}>
      <td className="break-words px-3 py-4 sm:px-4">
        <button
          className="text-left font-medium underline-offset-4 hover:underline focus-visible:rounded-sm"
          onClick={() => onSelect(candidate.selection)}
          aria-label={current ? label : `Select ${candidate.label}`}
        >
          {candidate.label}
        </button>
        <span className="mobile-source hidden">
          {source === "local"
            ? "Current source"
            : VERIFIED_V0141_RELEASE_MANIFEST.acceptedCombinations.some(
                  (item) => item.id === candidate.id,
                )
              ? "v0.14.1"
              : "Local source only"}
        </span>
        <details className="mt-2">
          <summary className="cursor-pointer underline-offset-4 hover:underline">
            Stack details
          </summary>
          <p className="mt-3 break-words">{stackDescription(candidate, source)}</p>
        </details>
      </td>
      <td className="px-4 py-4 text-muted-foreground">{candidate.stack.frontend}</td>
      <td className="px-4 py-4 text-muted-foreground">
        {candidate.selection.database === "none"
          ? "None"
          : candidate.selection.database.toUpperCase()}
      </td>
      <td className="px-4 py-4 text-muted-foreground">
        {candidate.selection.auth === "better-auth" ? "Better Auth" : "None"}
      </td>
      <td className="px-4 py-4 text-muted-foreground">
        {source === "local"
          ? "Current source"
          : VERIFIED_V0141_RELEASE_MANIFEST.acceptedCombinations.some(
                (combination) => combination.id === candidate.id,
              )
            ? "v0.14.1"
            : "Local source only"}
      </td>
      <td className="break-words px-3 py-4 sm:px-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelect(candidate.selection)}
          aria-label={current ? label : `Choose ${candidate.label}`}
        >
          Choose
        </Button>
      </td>
    </tr>
  );
}

interface ChoiceProps {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
}

function Choice({ label, value, options, onChange, disabled, hint }: ChoiceProps) {
  const id = label.toLocaleLowerCase().replaceAll(" ", "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        disabled={disabled}
        items={options.map(([option, text]) => ({ value: option, label: text }))}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next);
        }}
      >
        <SelectTrigger
          id={id}
          className="min-h-11 w-full"
          aria-describedby={hint ? `${id}-hint` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          {options.map(([option, text]) => (
            <SelectItem key={option} value={option}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
