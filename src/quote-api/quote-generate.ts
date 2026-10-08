import { fileURLToPath } from "node:url";
import { type Canvas, type CanvasRenderingContext2D, createCanvas, type Image, loadImage, registerFont } from "canvas";
import EmojiDb from "emoji-db";
import { LRUCache } from "lru-cache";
import sharp from "sharp";
import smartcrop from "smartcrop-sharp";
import { ColorContrast } from "./color-contrast.ts";
import { colorLuminance, normalizeColor } from "./colors.ts";
import { loadEmojiImages } from "./emoji-image.ts";
import { loadImageFromUrl } from "./image-load-url.ts";
import { BotTokenMissingError, Telegram } from "./telegram.ts";
import type { MessageEntity, QuoteMessage, QuoteUser, TelegramFile } from "./types.ts";

// node-canvas only uses fonts registered before its first canvas; message text is drawn with the "NotoSans" family
const font = (file: string) => fileURLToPath(new URL(`../../assets/fonts/${file}`, import.meta.url));
registerFont(font("NotoSans-Regular.ttf"), { family: "NotoSans", weight: "normal" });
registerFont(font("NotoSans-Bold.ttf"), { family: "NotoSans", weight: "bold" });

const emojiDb = new EmojiDb({ useDefaultDb: true });

const avatarCache = new LRUCache<string, Image>({ max: 20, ttl: 1000 * 60 * 5 });

const segmenter = new Intl.Segmenter();
const firstGrapheme = (text: string) => segmenter.segment(text)[Symbol.iterator]().next().value?.segment ?? "";

const logError = (error: unknown): undefined => {
  if (!(error instanceof BotTokenMissingError)) console.error(error);
};

type Drawable = Canvas | Image;
type StyledChar = { char: string; style: string[]; emoji?: { index: number; code: string }; customEmojiId?: string };
type StyledWord = { word: string; style: string[]; emoji?: StyledChar["emoji"]; customEmojiId?: string };
type CustomEmojiSticker = { custom_emoji_id: string; thumb?: TelegramFile; thumbnail?: TelegramFile };

const avatarColorArray = [
  ["#FF885E", "#FF516A"], // red
  ["#FFCD6A", "#FFA85C"], // orange
  ["#E0A2F3", "#D669ED"], // purple
  ["#A0DE7E", "#54CB68"], // green
  ["#53EDD6", "#28C9B7"], // sea
  ["#72D5FD", "#2A9EF1"], // blue
  ["#FFA8A8", "#FF719A"], // pink
];

const nameColorLight = [
  "#FC5C51", // red
  "#FA790F", // orange
  "#895DD5", // purple
  "#0FB297", // green
  "#0FC9D6", // sea
  "#3CA5EC", // blue
  "#D54FAF", // pink
];

const nameColorDark = [
  "#FF8E86", // red
  "#FFA357", // orange
  "#B18FFF", // purple
  "#4DD6BF", // green
  "#45E8D1", // sea
  "#7AC9FF", // blue
  "#FF7FD5", // pink
];

const breakMatch = /<br>|\n|\r/;
const spaceMatch = /[\f\n\r\t\v\u0020\u1680\u2000-\u200a\u2028\u2029\u205f\u3000]/;
const CJKMatch =
  /[\u1100-\u11ff\u2e80-\u2eff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3100-\u312f\u3130-\u318f\u3190-\u319f\u31a0-\u31bf\u31c0-\u31ef\u31f0-\u31ff\u3200-\u32ff\u3300-\u33ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/;
const RTLMatch = /[\u0591-\u07ff\u200f\u202b\u202e\ufb1d-\ufdfd\ufe70-\ufefc]/;

export class QuoteGenerate {
  telegram: Telegram;

  constructor(botToken: string | undefined) {
    this.telegram = new Telegram(botToken);
  }

  async avatarImageLetters(letters: string, color: string[]): Promise<Buffer> {
    const size = 500;
    const canvas = createCanvas(size, size);
    const context = canvas.getContext("2d");

    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, color[0]);
    gradient.addColorStop(1, color[1]);

    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const drawLetters = await this.drawMultilineText(letters, null, size / 2, "#FFF", 0, size, size * 5, size * 5);
    context.drawImage(drawLetters, (canvas.width - drawLetters.width) / 2, (canvas.height - drawLetters.height) / 1.5);

    return canvas.toBuffer();
  }

  async downloadAvatarImage(user: QuoteUser): Promise<Image | undefined> {
    let nameLetters: string;
    if (user.first_name && user.last_name) nameLetters = firstGrapheme(user.first_name) + firstGrapheme(user.last_name);
    else {
      const nameWord = (user.first_name || user.name || user.title || "").toUpperCase().split(" ");
      if (nameWord.length > 1) nameLetters = firstGrapheme(nameWord[0]) + firstGrapheme(nameWord.at(-1)!);
      else nameLetters = firstGrapheme(nameWord[0]);
    }

    const cacheKey = String(user.id);
    const avatarImageCache = avatarCache.get(cacheKey);
    const avatarColor = avatarColorArray[Math.abs(user.id ?? 0) % 7];

    if (avatarImageCache) return avatarImageCache;
    if (user.photo?.url) return loadImage(user.photo.url);

    let avatarImage: Image | undefined;
    try {
      let userPhotoUrl: string | undefined;
      if (user.photo?.big_file_id) userPhotoUrl = await this.telegram.getFileLink(user.photo.big_file_id).catch(logError);

      if (!userPhotoUrl) {
        const chat = await this.telegram.getChat(user.id).catch(logError);
        const userPhoto = chat?.photo?.big_file_id;

        if (userPhoto) userPhotoUrl = await this.telegram.getFileLink(userPhoto);
        else if (user.username) userPhotoUrl = `https://telega.one/i/userpic/320/${user.username}.jpg`;
        else avatarImage = await loadImage(await this.avatarImageLetters(nameLetters, avatarColor));
      }

      if (userPhotoUrl) avatarImage = await loadImage(userPhotoUrl);
      if (avatarImage) avatarCache.set(cacheKey, avatarImage);
    } catch {
      avatarImage = await loadImage(await this.avatarImageLetters(nameLetters, avatarColor));
    }

    return avatarImage;
  }

  async downloadMediaImage(media: string | TelegramFile, mediaSize: number, type: "id" | "url", crop: boolean): Promise<Image> {
    const mediaUrl = type === "url" && typeof media === "string" ? media : await this.telegram.getFileLink(media);
    const load = await loadImageFromUrl(mediaUrl);

    if (!crop && !/.webp/.test(mediaUrl)) return loadImage(load);

    const imageSharp = sharp(load);
    const imageMetadata = await imageSharp.metadata();
    const sharpPng = await imageSharp.png({ force: true }).toBuffer();

    let croppedImage: Buffer;
    if (imageMetadata.format === "webp") {
      // Trims the uniform (usually transparent) border around stickers; keep the original if nothing is left
      croppedImage = await sharp(sharpPng)
        .trim({ threshold: 1 })
        .png({ force: true })
        .toBuffer()
        .catch(() => sharpPng);
    } else {
      const { topCrop } = await smartcrop.crop(sharpPng, { width: mediaSize, height: imageMetadata.height! });
      croppedImage = await imageSharp
        .extract({ width: topCrop.width, height: topCrop.height, left: topCrop.x, top: topCrop.y })
        .png({ force: true })
        .toBuffer();
    }

    return loadImage(croppedImage);
  }

  hexToRgb(hex: string): number[] {
    return hex
      .replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (_m, r: string, g: string, b: string) => "#" + r + r + g + g + b + b)
      .substring(1)
      .match(/.{2}/g)!
      .map((x) => parseInt(x, 16));
  }

  // https://codepen.io/andreaswik/pen/YjJqpK
  lightOrDark(color: string): "light" | "dark" {
    let r: number, g: number, b: number;

    const rgbMatch = color.startsWith("rgb") ? color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/) : null;
    if (rgbMatch) {
      r = Number(rgbMatch[1]);
      g = Number(rgbMatch[2]);
      b = Number(rgbMatch[3]);
    } else {
      // http://gist.github.com/983661
      const hex = color.length < 5 ? color.slice(1).replace(/./g, "$&$&") : color.slice(1);
      const value = Number("0x" + hex);
      r = value >> 16;
      g = (value >> 8) & 255;
      b = value & 255;
    }

    // HSP equation from http://alienryderflex.com/hsp.html
    const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return hsp > 127.5 ? "light" : "dark";
  }

  async drawMultilineText(
    text: string,
    entities: MessageEntity[] | string | null | undefined,
    fontSize: number,
    fontColor: string,
    textX: number,
    textY: number,
    maxWidth: number,
    maxHeight: number,
  ): Promise<Canvas> {
    if (maxWidth > 10000) maxWidth = 10000;
    if (maxHeight > 10000) maxHeight = 10000;

    const emojiImageJson = await loadEmojiImages();

    const canvas = createCanvas(maxWidth + fontSize, maxHeight + fontSize);
    const canvasCtx = canvas.getContext("2d");

    // Noto fonts lack the Ukrainian "і", so swap it for the Latin "i"
    text = text.replace(/і/g, "i");
    const chars = text.split("");

    const lineHeight = 4 * (fontSize * 0.3);

    const styledChar: StyledChar[] = chars.map((char) => ({ char, style: typeof entities === "string" ? [entities] : [] }));

    if (Array.isArray(entities)) {
      for (const entity of entities) {
        let style: string;
        if (["pre", "code", "pre_code"].includes(entity.type)) style = "monospace";
        else if (["mention", "text_mention", "hashtag", "email", "phone_number", "bot_command", "url", "text_link"].includes(entity.type))
          style = "mention";
        else style = entity.type;

        if (entity.type === "custom_emoji") styledChar[entity.offset].customEmojiId = entity.custom_emoji_id;

        for (let charIndex = entity.offset; charIndex < entity.offset + entity.length; charIndex++) {
          styledChar[charIndex].style = styledChar[charIndex].style.concat(style);
        }
      }
    }

    const emojis = emojiDb.searchFromText({ input: text, fixCodePoints: true });
    for (let emojiIndex = 0; emojiIndex < emojis.length; emojiIndex++) {
      const emoji = emojis[emojiIndex];
      for (let charIndex = emoji.offset; charIndex < emoji.offset + emoji.length; charIndex++) {
        styledChar[charIndex].emoji = { index: emojiIndex, code: emoji.found };
      }
    }

    const styledWords: StyledWord[] = [];
    let stringNum = 0;

    for (let index = 0; index < styledChar.length; index++) {
      const charStyle = styledChar[index];
      const lastChar = styledChar[index - 1];

      if (
        lastChar &&
        ((charStyle.emoji && !lastChar.emoji) ||
          (!charStyle.emoji && lastChar.emoji) ||
          (charStyle.emoji && lastChar.emoji && charStyle.emoji.index !== lastChar.emoji.index) ||
          breakMatch.test(charStyle.char) ||
          (spaceMatch.test(charStyle.char) && !spaceMatch.test(lastChar.char)) ||
          (spaceMatch.test(lastChar.char) && !spaceMatch.test(charStyle.char)) ||
          charStyle.style.toString() !== lastChar.style.toString() ||
          CJKMatch.test(charStyle.char) ||
          CJKMatch.test(lastChar.char))
      ) {
        stringNum++;
      }

      if (!styledWords[stringNum]) {
        styledWords[stringNum] = { word: charStyle.char, style: charStyle.style };
        if (charStyle.emoji) styledWords[stringNum].emoji = charStyle.emoji;
        if (charStyle.customEmojiId) styledWords[stringNum].customEmojiId = charStyle.customEmojiId;
      } else styledWords[stringNum].word += charStyle.char;
    }

    let lineX = textX;
    let lineY = textY;
    let textWidth = 0;

    const customEmojiStickers = await this.loadCustomEmojiStickers(styledWords.flatMap((word) => word.customEmojiId ?? []));

    let breakWrite = false;
    let lineDirection = RTLMatch.test(styledWords[0].word) ? "rtl" : "ltr";

    for (let index = 0; index < styledWords.length; index++) {
      const styledWord = styledWords[index];

      let emojiImage: Image | undefined;
      if (styledWord.emoji) {
        if (styledWord.customEmojiId && customEmojiStickers[styledWord.customEmojiId]) {
          emojiImage = customEmojiStickers[styledWord.customEmojiId];
        } else {
          const emojiImageBase = emojiImageJson[styledWord.emoji.code];
          if (emojiImageBase) emojiImage = await loadImage(Buffer.from(emojiImageBase, "base64")).catch(() => undefined);
        }
      }

      let fontType = "";
      let fontName = "NotoSans";
      let fillStyle = fontColor;

      if (styledWord.style.includes("bold")) fontType += "bold ";
      if (styledWord.style.includes("italic")) fontType += "italic ";
      if (styledWord.style.includes("monospace")) {
        fontName = "NotoSansMono";
        fillStyle = "#5887a7";
      }
      if (styledWord.style.includes("mention")) fillStyle = "#6ab7ec";
      if (styledWord.style.includes("spoiler")) {
        const rbaColor = this.hexToRgb(normalizeColor(fontColor));
        fillStyle = `rgba(${rbaColor[0]}, ${rbaColor[1]}, ${rbaColor[2]}, 0.15)`;
      }

      canvasCtx.font = `${fontType} ${fontSize}px ${fontName}`;
      canvasCtx.fillStyle = fillStyle;

      if (canvasCtx.measureText(styledWord.word).width > maxWidth - fontSize * 3) {
        while (canvasCtx.measureText(styledWord.word).width > maxWidth - fontSize * 3) {
          styledWord.word = styledWord.word.slice(0, -1);
          if (styledWord.word.length <= 0) break;
        }
        styledWord.word += "…";
      }

      let lineWidth: number;
      const wordWidth = canvasCtx.measureText(styledWord.word).width;

      if (styledWord.emoji) lineWidth = lineX + fontSize;
      else lineWidth = lineX + wordWidth;

      if (breakMatch.test(styledWord.word) || (lineWidth > maxWidth - fontSize * 2 && wordWidth < maxWidth)) {
        if (spaceMatch.test(styledWord.word) && !breakMatch.test(styledWord.word)) styledWord.word = "";
        if ((spaceMatch.test(styledWord.word) || !breakMatch.test(styledWord.word)) && lineY + lineHeight > maxHeight) {
          while (lineWidth > maxWidth - fontSize * 2) {
            styledWord.word = styledWord.word.slice(0, -1);
            lineWidth = lineX + canvasCtx.measureText(styledWord.word).width;
            if (styledWord.word.length <= 0) break;
          }

          styledWord.word += "…";
          lineWidth = lineX + canvasCtx.measureText(styledWord.word).width;
          breakWrite = true;
        } else {
          if (styledWord.emoji) lineWidth = textX + fontSize + fontSize * 0.2;
          else lineWidth = textX + canvasCtx.measureText(styledWord.word).width;

          lineX = textX;
          lineY += lineHeight;
          if (index < styledWords.length - 1) {
            const nextLineDirection = RTLMatch.test(styledWords[index + 1].word) ? "rtl" : "ltr";
            if (lineDirection !== nextLineDirection) textWidth = maxWidth - fontSize * 2;
            lineDirection = nextLineDirection;
          }
        }
      }

      if (styledWord.emoji) lineWidth += fontSize * 0.2;

      if (lineWidth > textWidth) textWidth = lineWidth;
      if (textWidth > maxWidth) textWidth = maxWidth;

      const wordX = lineDirection === "rtl" ? maxWidth - lineX - wordWidth - fontSize * 2 : lineX;

      if (emojiImage) {
        canvasCtx.drawImage(emojiImage, wordX, lineY - fontSize + fontSize * 0.15, fontSize + fontSize * 0.22, fontSize + fontSize * 0.22);
      } else {
        canvasCtx.fillText(styledWord.word, wordX, lineY);

        const measuredWidth = canvasCtx.measureText(styledWord.word).width;
        if (styledWord.style.includes("strikethrough")) canvasCtx.fillRect(wordX, lineY - fontSize / 2.8, measuredWidth, fontSize * 0.1);
        if (styledWord.style.includes("underline")) canvasCtx.fillRect(wordX, lineY + 2, measuredWidth, fontSize * 0.1);
      }

      lineX = lineWidth;

      if (breakWrite) break;
    }

    const canvasResize = createCanvas(textWidth, lineY + fontSize);
    const canvasResizeCtx = canvasResize.getContext("2d");

    const dx = lineDirection === "rtl" ? textWidth - maxWidth + fontSize * 2 : 0;
    canvasResizeCtx.drawImage(canvas, dx, 0);

    return canvasResize;
  }

  async loadCustomEmojiStickers(customEmojiIds: string[]): Promise<Record<string, Image>> {
    const customEmojiStickers: Record<string, Image> = {};
    if (customEmojiIds.length === 0) return customEmojiStickers;

    const stickers = await this.telegram
      .callApi<CustomEmojiSticker[]>("getCustomEmojiStickers", { custom_emoji_ids: customEmojiIds })
      .catch(() => undefined);
    if (!stickers) return customEmojiStickers;

    await Promise.all(
      stickers.map(async (sticker) => {
        const thumb = sticker.thumbnail ?? sticker.thumb;
        if (!thumb) return;

        const fileLink = await this.telegram.getFileLink(thumb).catch(() => undefined);
        if (!fileLink) return;

        const load = await loadImageFromUrl(fileLink);
        const sharpPng = await sharp(load).png({ force: true }).toBuffer();
        customEmojiStickers[sticker.custom_emoji_id] = await loadImage(sharpPng);
      }),
    ).catch(() => {});

    return customEmojiStickers;
  }

  // https://stackoverflow.com/a/3368118
  roundRectPath(canvasCtx: CanvasRenderingContext2D, w: number, h: number, r: number) {
    const x = 0;
    const y = 0;

    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    canvasCtx.beginPath();
    canvasCtx.moveTo(x + r, y);
    canvasCtx.arcTo(x + w, y, x + w, y + h, r);
    canvasCtx.arcTo(x + w, y + h, x, y + h, r);
    canvasCtx.arcTo(x, y + h, x, y, r);
    canvasCtx.arcTo(x, y, x + w, y, r);
  }

  drawRoundRect(color: string, w: number, h: number, r: number): Canvas {
    const canvas = createCanvas(w, h);
    const canvasCtx = canvas.getContext("2d");

    canvasCtx.fillStyle = color;
    this.roundRectPath(canvasCtx, w, h, r);
    canvasCtx.closePath();
    canvasCtx.fill();

    return canvas;
  }

  drawGradientRoundRect(colorOne: string, colorTwo: string, w: number, h: number, r: number): Canvas {
    const canvas = createCanvas(w, h);
    const canvasCtx = canvas.getContext("2d");

    const gradient = canvasCtx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, colorOne);
    gradient.addColorStop(1, colorTwo);

    canvasCtx.fillStyle = gradient;
    this.roundRectPath(canvasCtx, w, h, r);
    canvasCtx.closePath();
    canvasCtx.fill();

    return canvas;
  }

  roundImage(image: Drawable, r: number): Canvas {
    const canvas = createCanvas(image.width, image.height);
    const canvasCtx = canvas.getContext("2d");

    this.roundRectPath(canvasCtx, image.width, image.height, r);
    canvasCtx.clip();
    canvasCtx.drawImage(image, 0, 0);

    return canvas;
  }

  drawReplyLine(lineWidth: number, height: number, color: string): Canvas {
    const canvas = createCanvas(20, height);
    const context = canvas.getContext("2d");
    context.beginPath();
    context.moveTo(10, 0);
    context.lineTo(10, height);
    context.lineWidth = lineWidth;
    context.strokeStyle = color;
    context.stroke();

    return canvas;
  }

  async drawAvatar(user: QuoteUser): Promise<Canvas | undefined> {
    const avatarImage = await this.downloadAvatarImage(user);
    if (!avatarImage) return;

    const avatarSize = avatarImage.naturalHeight;

    const canvas = createCanvas(avatarSize, avatarSize);
    const canvasCtx = canvas.getContext("2d");

    canvasCtx.beginPath();
    canvasCtx.arc(avatarSize / 2, avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    canvasCtx.clip();
    canvasCtx.drawImage(avatarImage, 0, 0, avatarSize, avatarSize);

    return canvas;
  }

  drawLineSegment(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, isEven: boolean) {
    ctx.lineWidth = 35;
    ctx.strokeStyle = "#aec6cf";
    ctx.beginPath();
    y = isEven ? y : -y;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, y);
    ctx.arc(x + width / 2, y, width / 2, Math.PI, 0, isEven);
    ctx.lineTo(x + width, 0);
    ctx.stroke();
  }

  drawWaveform(data: number[]): Canvas {
    const normalizedData = data.map((i) => i / 32);

    const canvas = createCanvas(4500, 500);
    const padding = 50;
    canvas.height = canvas.height + padding * 2;
    const ctx = canvas.getContext("2d");
    ctx.translate(0, canvas.height / 2 + padding);

    const width = canvas.width / normalizedData.length;
    for (let i = 0; i < normalizedData.length; i++) {
      const x = width * i;
      let height = normalizedData[i] * canvas.height - padding;
      if (height < 0) height = 0;
      else if (height > canvas.height / 2) height = canvas.height / 2;
      this.drawLineSegment(ctx, x, height, width, (i + 1) % 2 === 1);
    }
    return canvas;
  }

  drawQuote(
    scale = 1,
    backgroundColorOne: string,
    backgroundColorTwo: string,
    avatar: Canvas | undefined,
    replyName: Canvas | undefined,
    replyNameColor: string | undefined,
    replyText: Canvas | undefined,
    name: Canvas | undefined,
    text: Canvas | undefined,
    media: Drawable | undefined,
    mediaType: string | undefined,
    maxMediaSize = 0,
  ): Canvas {
    const avatarPosX = 0 * scale;
    const avatarPosY = 5 * scale;
    const avatarSize = 50 * scale;

    const blockPosX = avatarSize + 10 * scale;
    const blockPosY = 0;

    const indent = 14 * scale;

    if (mediaType === "sticker") name = undefined;

    const reply = replyName && replyText ? { name: replyName, text: replyText } : undefined;

    let width = 0;
    if (name) width = name.width;
    if (text && width < text.width + indent) width = text.width + indent;
    if (name && width < name.width + indent) width = name.width + indent;
    if (reply) {
      if (width < reply.name.width) width = reply.name.width + indent * 2;
      if (width < reply.text.width) width = reply.text.width + indent * 2;
    }

    let height = indent;
    if (text) height += text.height;
    else height += indent;

    if (name) {
      height = name.height;
      if (text) height = text.height + name.height;
      else height += indent;
    }

    width += blockPosX + indent;
    height += blockPosY;

    let namePosX = blockPosX + indent;
    let namePosY = indent;

    if (!name) {
      namePosX = 0;
      namePosY = -indent;
    }

    const textPosX = blockPosX + indent;
    let textPosY = indent;
    if (name) {
      textPosY = name.height + indent * 0.25;
      height += indent * 0.25;
    }

    let replyPosX = 0;
    let replyNamePosY = 0;
    let replyTextPosY = 0;

    if (reply) {
      replyPosX = textPosX + indent;

      const replyNameHeight = reply.name.height;
      const replyTextHeight = reply.text.height * 0.5;

      replyNamePosY = namePosY + replyNameHeight;
      replyTextPosY = replyNamePosY + replyTextHeight;

      textPosY += replyNameHeight + replyTextHeight + indent / 4;
      height += replyNameHeight + replyTextHeight + indent / 4;
    }

    let mediaPosX = 0;
    let mediaPosY = 0;
    let mediaWidth = 0;
    let mediaHeight = 0;

    if (media) {
      mediaWidth = media.width * (maxMediaSize / media.height);
      mediaHeight = maxMediaSize;

      if (mediaWidth >= maxMediaSize) {
        mediaWidth = maxMediaSize;
        mediaHeight = media.height * (maxMediaSize / media.width);
      }

      if (!text || text.width <= mediaWidth || mediaWidth > width - blockPosX) {
        width = mediaWidth + indent * 6;
      }

      height += mediaHeight;
      if (!text) height += indent;

      if (name) {
        mediaPosX = namePosX;
        mediaPosY = name.height + 5 * scale;
      } else {
        mediaPosX = blockPosX + indent;
        mediaPosY = indent;
      }
      if (reply) mediaPosY += replyNamePosY + indent / 2;
      textPosY = mediaPosY + mediaHeight + 5 * scale;
    }

    const isStickerWithHeader = mediaType === "sticker" && (name || reply);
    if (isStickerWithHeader) {
      mediaPosY += indent * 4;
      height += indent * 2;
    }

    const canvas = createCanvas(width, height);
    const canvasCtx = canvas.getContext("2d");

    const rectWidth = width - blockPosX;
    let rectHeight = height;
    const rectPosX = blockPosX;
    const rectPosY = blockPosY;
    const rectRoundRadius = 25 * scale;

    if (isStickerWithHeader) rectHeight -= mediaHeight + indent * 2;

    let rect: Canvas | undefined;
    if (mediaType !== "sticker" || name || reply) {
      if (backgroundColorOne === backgroundColorTwo) {
        rect = this.drawRoundRect(backgroundColorOne, rectWidth, rectHeight, rectRoundRadius);
      } else {
        rect = this.drawGradientRoundRect(backgroundColorOne, backgroundColorTwo, rectWidth, rectHeight, rectRoundRadius);
      }
    }

    if (avatar) canvasCtx.drawImage(avatar, avatarPosX, avatarPosY, avatarSize, avatarSize);
    if (rect) canvasCtx.drawImage(rect, rectPosX, rectPosY);
    if (name) canvasCtx.drawImage(name, namePosX, namePosY);
    if (text) canvasCtx.drawImage(text, textPosX, textPosY);
    if (media) canvasCtx.drawImage(this.roundImage(media, 5 * scale), mediaPosX, mediaPosY, mediaWidth, mediaHeight);

    if (reply) {
      const replyLine = this.drawReplyLine(3 * scale, reply.name.height + reply.text.height * 0.4, replyNameColor!);
      canvasCtx.drawImage(replyLine, textPosX - 3, replyNamePosY);
      canvasCtx.drawImage(reply.name, replyPosX, replyNamePosY);
      canvasCtx.drawImage(reply.text, replyPosX, replyTextPosY);
    }

    return canvas;
  }

  async generate(
    backgroundColorOne: string,
    backgroundColorTwo: string,
    message: QuoteMessage,
    width = 512,
    height = 512,
    scale = 2,
  ): Promise<Canvas> {
    if (!scale) scale = 2;
    if (scale > 20) scale = 20;
    width *= scale;
    height *= scale;

    const backStyle = this.lightOrDark(backgroundColorOne);

    let nameIndex = 1;
    if (message.from.id) nameIndex = Math.abs(message.from.id) % 7;

    const nameColorArray = backStyle === "light" ? nameColorLight : nameColorDark;
    let nameColor = nameColorArray[nameIndex];

    // Keep the name readable against the bubble background
    const colorContrast = new ColorContrast();
    const contrast = colorContrast.getContrastRatio(colorLuminance(backgroundColorOne, 0.55), nameColor);
    if (contrast > 90 || contrast < 30) {
      nameColor = colorContrast.adjustContrast(colorLuminance(backgroundColorTwo, 0.55), nameColor);
    }

    const nameSize = 22 * scale;

    let nameCanvas: Canvas | undefined;
    if (message.from.name) {
      let name = message.from.name;
      const nameEntities: MessageEntity[] = [{ type: "bold", offset: 0, length: name.length }];

      if (message.from.emoji_status) {
        name += " 🤡";
        nameEntities.push({ type: "custom_emoji", offset: name.length - 2, length: 2, custom_emoji_id: message.from.emoji_status });
      }

      nameCanvas = await this.drawMultilineText(name, nameEntities, nameSize, nameColor, 0, nameSize, width, nameSize);
    }

    const fontSize = 24 * scale;
    const textColor = backStyle === "light" ? "#000" : "#fff";

    let textCanvas: Canvas | undefined;
    if (message.text) {
      textCanvas = await this.drawMultilineText(message.text, message.entities, fontSize, textColor, 0, fontSize, width, height - fontSize);
    }

    let avatarCanvas: Canvas | undefined;
    if (message.avatar) avatarCanvas = await this.drawAvatar(message.from);

    let replyName: Canvas | undefined;
    let replyNameColor: string | undefined;
    let replyText: Canvas | undefined;
    if (message.replyMessage?.name && message.replyMessage.text) {
      replyNameColor = nameColorArray[Math.abs(message.replyMessage.chatId ?? 0) % 7];

      const replyNameFontSize = 16 * scale;
      replyName = await this.drawMultilineText(
        message.replyMessage.name,
        "bold",
        replyNameFontSize,
        replyNameColor,
        0,
        replyNameFontSize,
        width * 0.9,
        replyNameFontSize,
      );

      const replyTextFontSize = 21 * scale;
      replyText = await this.drawMultilineText(
        message.replyMessage.text,
        message.replyMessage.entities,
        replyTextFontSize,
        textColor,
        0,
        replyTextFontSize,
        width * 0.9,
        replyTextFontSize,
      );
    }

    let mediaCanvas: Drawable | undefined;
    let mediaType: string | undefined;
    let maxMediaSize: number | undefined;
    if (message.media) {
      let media: string | TelegramFile;
      let type: "id" | "url";
      const crop = Boolean(message.mediaCrop);

      if (!Array.isArray(message.media)) {
        type = "url";
        media = message.media.url;
      } else {
        type = "id";
        if (message.media.length > 1) media = crop ? message.media[1] : message.media.at(-1)!;
        else media = message.media[0];
      }

      maxMediaSize = (width / 3) * scale;
      if (textCanvas && maxMediaSize < textCanvas.width) maxMediaSize = textCanvas.width;

      if (typeof media === "object" && media.is_animated) {
        media = (media.thumbnail ?? media.thumb)!;
        maxMediaSize = maxMediaSize / 2;
      }

      mediaCanvas = await this.downloadMediaImage(media, maxMediaSize, type, crop);
      mediaType = message.mediaType;
    }

    if (message.voice) {
      mediaCanvas = this.drawWaveform(message.voice.waveform);
      maxMediaSize = (width / 3) * scale;
    }

    return this.drawQuote(
      scale,
      backgroundColorOne,
      backgroundColorTwo,
      avatarCanvas,
      replyName,
      replyNameColor,
      replyText,
      nameCanvas,
      textCanvas,
      mediaCanvas,
      mediaType,
      maxMediaSize,
    );
  }
}
