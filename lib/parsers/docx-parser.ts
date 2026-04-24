import mammoth from "mammoth";

export async function parseDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({
    buffer: Buffer.from(buffer),
  });
  return result.value;
}
