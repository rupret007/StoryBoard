import { createHash } from "node:crypto";

function escapePdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

/** A deliberately small, dependency-free PDF writer for reviewed text documents. */
export function renderTextPdf(title: string, body: string): { bytes: Buffer; sha256: string } {
  const lines = [title, "", ...body.replaceAll("\r", "").split("\n")].flatMap((line) => {
    if (line.length <= 92) return [line];
    const chunks: string[] = [];
    for (let offset = 0; offset < line.length; offset += 92) chunks.push(line.slice(offset, offset + 92));
    return chunks;
  }).slice(0, 58);
  const commands = ["BT", "/F1 11 Tf", "54 750 Td", ...lines.flatMap((line, index) => index === 0 ? [`(${escapePdfText(line)}) Tj`] : ["0 -12 Td", `(${escapePdfText(line)}) Tj`]), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = Buffer.from(output);
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}
