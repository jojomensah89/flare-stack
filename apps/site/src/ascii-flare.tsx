// A deterministic character drawing: the Flare mark, rather than a borrowed asset.
const FLARE = Array.from({ length: 32 }, (_, row) => {
  const height = 1 - row / 31;
  const center = Math.sin(height * 6) * 0.23 * height;
  const width = Math.pow(Math.sin(Math.PI * height), 0.65) * (0.66 + 0.28 * Math.sin(height * 5));
  return Array.from({ length: 68 }, (_, column) => {
    const x = (column - 34) / 20;
    const depth = width - Math.abs(x - center);
    const hollow =
      height > 0.08 &&
      height < 0.52 &&
      Math.abs(x + 0.05) < 0.25 * Math.sin((Math.PI * (height - 0.08)) / 0.44);
    if (depth < 0 || hollow) return " ";
    const grain = ((column * 17 + row * 31) % 11) / 11;
    return ".:+*#"[Math.min(4, Math.floor(depth * 5 + grain))];
  }).join("");
}).join("\n");

export function AsciiFlare() {
  return (
    <div className="ascii-flare" role="img" aria-label="A flame drawn in ASCII characters">
      <pre aria-hidden="true">{FLARE}</pre>
    </div>
  );
}
