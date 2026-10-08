import { fileURLToPath } from "node:url";
import { type Canvas, createCanvas, type Image, loadImage } from "canvas";
import sharp from "sharp";
import { colorLuminance, normalizeColor } from "./colors.ts";
import { QuoteGenerate } from "./quote-generate.ts";
import type { QuoteParams, QuoteResult } from "./types.ts";

const patternPath = fileURLToPath(new URL("../../assets/pattern_02.png", import.meta.url));

const imageAlpha = (image: Image, alpha: number): Canvas => {
  const canvas = createCanvas(image.width, image.height);
  const canvasCtx = canvas.getContext("2d");
  canvasCtx.globalAlpha = alpha;
  canvasCtx.drawImage(image, 0, 0);
  return canvas;
};

// Radial gradient overlaid with the semi-transparent doodle pattern, used behind "image" and "stories" output
const drawPatternBackground = async (canvas: Canvas, colorOne: string, colorTwo: string) => {
  const canvasCtx = canvas.getContext("2d");

  const gradient = canvasCtx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    0,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width / 2,
  );
  gradient.addColorStop(0, colorOne);
  gradient.addColorStop(1, colorTwo);

  canvasCtx.fillStyle = gradient;
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  const pattern = canvasCtx.createPattern(imageAlpha(await loadImage(patternPath), 0.3), "repeat");
  canvasCtx.fillStyle = pattern;
  canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

  canvasCtx.shadowOffsetX = 8;
  canvasCtx.shadowOffsetY = 8;
  canvasCtx.shadowBlur = 13;
  canvasCtx.shadowColor = "rgba(0, 0, 0, 0.5)";

  return canvasCtx;
};

export const generate = async (params: QuoteParams | undefined): Promise<QuoteResult> => {
  if (!params) return { error: "query_empty" };
  if (!params.messages || params.messages.length < 1) return { error: "messages_empty" };

  const quoteGenerate = new QuoteGenerate(params.botToken || process.env.BOT_TOKEN);
  const scale = Number.parseFloat(String(params.scale));

  let backgroundColor = params.backgroundColor || "//#292232";
  let backgroundColorOne: string;
  let backgroundColorTwo: string;

  // "a/b" is a two-color gradient, "//a" derives a gradient from one color, anything else is a solid fill
  const backgroundColorSplit = backgroundColor.split("/");

  if (backgroundColorSplit.length > 1 && backgroundColorSplit[0] !== "") {
    backgroundColorOne = normalizeColor(backgroundColorSplit[0]);
    backgroundColorTwo = normalizeColor(backgroundColorSplit[1]);
  } else if (backgroundColor.startsWith("//")) {
    backgroundColor = normalizeColor(backgroundColor.replace("//", ""));
    backgroundColorOne = colorLuminance(backgroundColor, 0.35);
    backgroundColorTwo = colorLuminance(backgroundColor, -0.15);
  } else {
    backgroundColor = normalizeColor(backgroundColor);
    backgroundColorOne = backgroundColor;
    backgroundColorTwo = backgroundColor;
  }

  const quoteImages: Canvas[] = [];
  for (const message of params.messages) {
    if (!message) continue;
    quoteImages.push(await quoteGenerate.generate(backgroundColorOne, backgroundColorTwo, message, params.width, params.height, scale));
  }

  if (quoteImages.length === 0) return { error: "empty_messages" };

  let canvasQuote: Canvas;
  if (quoteImages.length > 1) {
    let width = 0;
    let height = 0;

    for (const quoteImage of quoteImages) {
      if (quoteImage.width > width) width = quoteImage.width;
      height += quoteImage.height;
    }

    const quoteMargin = 5 * scale;

    const canvas = createCanvas(width, height + quoteMargin * quoteImages.length);
    const canvasCtx = canvas.getContext("2d");

    let imageY = 0;
    for (const quoteImage of quoteImages) {
      canvasCtx.drawImage(quoteImage, 0, imageY);
      imageY += quoteImage.height + quoteMargin;
    }
    canvasQuote = canvas;
  } else {
    canvasQuote = quoteImages[0];
  }

  let { type } = params;
  const { format, ext } = params;

  if (!type && ext) type = "png";
  if (type !== "image" && type !== "stories" && canvasQuote.height > 1024 * 2) type = "png";

  let quoteImage: Buffer;

  if (type === "quote") {
    const downPadding = 75;
    const maxWidth = 512;
    const maxHeight = 512;

    const imageQuoteSharp = sharp(canvasQuote.toBuffer());
    if (canvasQuote.height > canvasQuote.width) imageQuoteSharp.resize({ height: maxHeight });
    else imageQuoteSharp.resize({ width: maxWidth });

    const canvasImage = await loadImage(await imageQuoteSharp.toBuffer());

    const canvasPadding = createCanvas(canvasImage.width, canvasImage.height + downPadding);
    canvasPadding.getContext("2d").drawImage(canvasImage, 0, 0);

    const imageSharp = sharp(canvasPadding.toBuffer());
    if (canvasPadding.height >= canvasPadding.width) imageSharp.resize({ height: maxHeight });
    else imageSharp.resize({ width: maxWidth });

    if (format === "png") quoteImage = await imageSharp.png().toBuffer();
    else quoteImage = await imageSharp.webp({ lossless: true, force: true }).toBuffer();
  } else if (type === "image") {
    const heightPadding = 75 * scale;
    const widthPadding = 95 * scale;

    const canvasImage = await loadImage(canvasQuote.toBuffer());
    const canvasPic = createCanvas(canvasImage.width + widthPadding, canvasImage.height + heightPadding);
    const canvasPicCtx = await drawPatternBackground(
      canvasPic,
      colorLuminance(backgroundColorTwo, 0.15),
      colorLuminance(backgroundColorOne, 0.15),
    );

    canvasPicCtx.drawImage(canvasImage, widthPadding / 2, heightPadding / 2);

    canvasPicCtx.shadowOffsetX = 0;
    canvasPicCtx.shadowOffsetY = 0;
    canvasPicCtx.shadowBlur = 0;
    canvasPicCtx.shadowColor = "rgba(0, 0, 0, 0)";

    // Watermark in the bottom-right corner
    canvasPicCtx.fillStyle = "rgba(0, 0, 0, 0.3)";
    canvasPicCtx.font = `${8 * scale}px Noto Sans`;
    canvasPicCtx.textAlign = "right";
    canvasPicCtx.fillText("@QuotLyBot", canvasPic.width - 25, canvasPic.height - 25);

    quoteImage = await sharp(canvasPic.toBuffer()).png({ force: true }).toBuffer();
  } else if (type === "stories") {
    const canvasPic = createCanvas(720, 1280);
    const canvasPicCtx = await drawPatternBackground(
      canvasPic,
      colorLuminance(backgroundColorTwo, 0.25),
      colorLuminance(backgroundColorOne, 0.15),
    );

    let canvasImage = await loadImage(canvasQuote.toBuffer());

    // Minimum gap between the quote and the edges of the picture
    const minPadding = 110;

    if (canvasImage.width > canvasPic.width - minPadding * 2 || canvasImage.height > canvasPic.height - minPadding * 2) {
      const resized = await sharp(canvasQuote.toBuffer())
        .resize({
          width: canvasPic.width - minPadding * 2,
          height: canvasPic.height - minPadding * 2,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .toBuffer();
      canvasImage = await loadImage(resized);
    }

    canvasPicCtx.drawImage(canvasImage, (canvasPic.width - canvasImage.width) / 2, (canvasPic.height - canvasImage.height) / 2);

    canvasPicCtx.shadowOffsetX = 0;
    canvasPicCtx.shadowOffsetY = 0;
    canvasPicCtx.shadowBlur = 0;

    // Vertical watermark centered on the left edge
    canvasPicCtx.fillStyle = "rgba(0, 0, 0, 0.4)";
    canvasPicCtx.font = `${16 * scale}px Noto Sans`;
    canvasPicCtx.textAlign = "center";
    canvasPicCtx.translate(70, canvasPic.height / 2);
    canvasPicCtx.rotate(-Math.PI / 2);
    canvasPicCtx.fillText("@QuotLyBot", 0, 0);

    quoteImage = await sharp(canvasPic.toBuffer()).png({ force: true }).toBuffer();
  } else {
    quoteImage = canvasQuote.toBuffer();
  }

  const { width, height } = await sharp(quoteImage).metadata();

  return {
    image: ext ? quoteImage : quoteImage.toString("base64"),
    type,
    width,
    height,
    ext,
  };
};
