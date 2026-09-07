/** Keeps a generated prompt visually recognizable wherever it is shown. */
export function promptToneHue(promptId: string): number {
  let hash = 0;

  for (let index = 0; index < promptId.length; index += 1) {
    hash = (hash * 31 + promptId.charCodeAt(index)) >>> 0;
  }

  return hash % 360;
}
