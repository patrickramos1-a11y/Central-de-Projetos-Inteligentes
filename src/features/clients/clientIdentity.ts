export type ClientKind = "AC" | "AV";

export const clientKindOptions = [
  { value: "AC", label: "AC" },
  { value: "AV", label: "AV" },
];

export function validateClientLogo(file: Pick<File, "type" | "size">): string | null {
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type)) {
    return "Escolha uma imagem PNG, JPEG, WebP ou GIF.";
  }
  if (file.size > 3_000_000) return "A logo deve ter ate 3 MB.";
  return null;
}
