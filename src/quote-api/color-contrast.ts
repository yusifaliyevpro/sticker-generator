// Nudges a text color brighter or darker until it reads well on the given background
export class ColorContrast {
  // Threshold that decides when a color is considered bright or dark
  brightnessThreshold = 175;

  // WCAG 2.0 brightness: https://www.w3.org/TR/WCAG20-TECHS/G18.html#G18-tests
  getBrightness(color: string): number {
    const [r, g, b] = this.hexToRgb(color);
    return (r * 299 + g * 587 + b * 114) / 1000;
  }

  hexToRgb(hex: string): [number, number, number] {
    return [parseInt(hex.substring(1, 3), 16), parseInt(hex.substring(3, 5), 16), parseInt(hex.substring(5, 7), 16)];
  }

  rgbToHex([r, g, b]: [number, number, number]): string {
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  }

  adjustBrightness(color: string, amount: number): string {
    const [r, g, b] = this.hexToRgb(color);
    const clamp = (value: number) => Math.max(0, Math.min(255, value + amount));
    return this.rgbToHex([clamp(r), clamp(g), clamp(b)]);
  }

  getContrastRatio(background: string, foreground: string): number {
    const brightness1 = this.getBrightness(background);
    const brightness2 = this.getBrightness(foreground);
    const lightest = Math.max(brightness1, brightness2);
    const darkest = Math.min(brightness1, brightness2);
    return (lightest + 0.05) / (darkest + 0.05);
  }

  adjustContrast(background: string, foreground: string): string {
    const contrastRatio = this.getContrastRatio(background, foreground);
    const brightnessDiff = this.getBrightness(background) - this.getBrightness(foreground);

    if (contrastRatio >= 4.5) return foreground;

    if (brightnessDiff >= 0) {
      const amount = Math.ceil((this.brightnessThreshold - this.getBrightness(foreground)) / 2);
      return this.adjustBrightness(foreground, amount);
    }

    const amount = Math.ceil((this.getBrightness(foreground) - this.brightnessThreshold) / 2);
    return this.adjustBrightness(foreground, -amount);
  }
}
