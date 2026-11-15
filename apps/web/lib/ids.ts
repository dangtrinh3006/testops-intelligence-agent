// Record-id recognition for turning plain text into evidence chips.
// Alternatives are ordered longest-first so composite ids (att-…-T-PAY-004-1) win over their parts.
const ID_SOURCES = [
  String.raw`artifacts:log\.line:att-[a-z0-9]+(?:-[a-z0-9]+)*-T-[A-Z]+-\d+-\d+:\d+`,
  String.raw`runner:attempt\.(?:result|started):att-[a-z0-9]+(?:-[a-z0-9]+)*-T-[A-Z]+-\d+-\d+`,
  String.raw`ci:run\.summary:run-[a-z0-9]+-[a-z0-9]+-\d+`,
  String.raw`att-[a-z0-9]+-[a-z0-9]+-\d+-T-[A-Z]+-\d+-\d+`,
  String.raw`run-[a-z0-9]+-[a-z0-9]+-\d+`,
  String.raw`rc-[a-z0-9]+-\d+\.\d+\.\d+`,
  String.raw`release-policy-v\d+`,
  String.raw`DQ-[A-Z]+-\d+`,
  String.raw`T-[A-Z]+-\d+`,
];

const ID_PATTERN = `(?<![\\w:.-])(?:${ID_SOURCES.join("|")})(?![\\w-])`;

export type TextPart = { type: "text"; value: string } | { type: "id"; value: string };

export function splitIds(text: string): TextPart[] {
  const re = new RegExp(ID_PATTERN, "g");
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ type: "text", value: text.slice(last, idx) });
    out.push({ type: "id", value: m[0] });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

export function isRecordId(text: string): boolean {
  return new RegExp(`^(?:${ID_SOURCES.join("|")})$`).test(text.trim());
}

// Raw runner events are not addressable by /api/records; their attempt id is.
export function attemptIdFromEvent(id: string): string | null {
  const m = /^runner:attempt\.(?:result|started):(att-.+)$/.exec(id);
  return m?.[1] ?? null;
}

export function idKind(id: string): string {
  if (id.startsWith("artifacts:")) return "log";
  if (id.startsWith("runner:")) return "raw event";
  if (id.startsWith("ci:")) return "CI summary";
  if (id.startsWith("att-")) return "attempt";
  if (id.startsWith("run-")) return "run";
  if (id.startsWith("rc-")) return "release candidate";
  if (id.startsWith("release-policy")) return "policy";
  if (id.startsWith("DQ-")) return "finding";
  if (id.startsWith("T-")) return "test";
  return "record";
}
