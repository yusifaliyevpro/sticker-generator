import { createCanvas } from "canvas";

// Lets canvas parse any CSS color and hands back its canonical "#rrggbb" / "rgba(...)" form
export const normalizeColor = (color: string): string => {
  const canvasCtx = createCanvas(0, 0).getContext("2d");
  canvasCtx.fillStyle = color;
  return canvasCtx.fillStyle as string;
};

export const colorLuminance = (hex: string, lum = 0): string => {
  hex = String(hex).replace(/[^0-9a-f]/gi, "");
  if (hex.length < 6) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];

  let rgb = "#";
  for (let i = 0; i < 3; i++) {
    const c = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    rgb += Math.round(Math.min(Math.max(0, c + c * lum), 255))
      .toString(16)
      .padStart(2, "0");
  }
  return rgb;
};
