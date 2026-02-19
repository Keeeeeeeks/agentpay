const RESET = "\u001b[0m";
const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const YELLOW = "\u001b[33m";

let jsonOutput = false;

export function setJsonOutput(enabled: boolean): void {
  jsonOutput = enabled;
}

export function isJsonOutput(): boolean {
  return jsonOutput;
}

export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

export function table(headers: string[], rows: string[][]): void {
  if (jsonOutput) {
    json(rows.map((row) => rowToObject(headers, row)));
    return;
  }

  const widths = headers.map((header, idx) => {
    const rowMax = rows.reduce((max, row) => Math.max(max, (row[idx] ?? "").length), 0);
    return Math.max(header.length, rowMax);
  });

  const border = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
  const renderRow = (cells: string[]) =>
    `| ${cells.map((cell, idx) => (cell ?? "").padEnd(widths[idx], " ")).join(" | ")} |`;

  console.log(border);
  console.log(renderRow(headers));
  console.log(border);
  for (const row of rows) {
    console.log(renderRow(row));
  }
  console.log(border);
}

export function success(message: string): void {
  if (jsonOutput) {
    json({ status: "success", message });
    return;
  }
  console.log(`${GREEN}\u2713${RESET} ${message}`);
}

export function error(message: string): void {
  if (jsonOutput) {
    json({ status: "error", message });
    return;
  }
  console.error(`${RED}X${RESET} ${message}`);
}

export function warn(message: string): void {
  if (jsonOutput) {
    json({ status: "warn", message });
    return;
  }
  console.warn(`${YELLOW}!${RESET} ${message}`);
}

function rowToObject(headers: string[], row: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < headers.length; index += 1) {
    result[headers[index]] = row[index] ?? "";
  }
  return result;
}
