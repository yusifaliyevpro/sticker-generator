import { readFile } from "node:fs/promises";

type EmojiImages = Record<string, string>;

let emojiImages: Promise<EmojiImages> | undefined;

// Apple's set, the closest match to WhatsApp's; a 28 MB JSON of base64 PNGs, so it's parsed on first use
export const loadEmojiImages = (): Promise<EmojiImages> => {
  emojiImages ??= readFile(new URL("../../assets/emoji/emoji-apple-image.json", import.meta.url), "utf8")
    .then((json) => JSON.parse(json) as EmojiImages)
    .catch((error: unknown) => {
      console.error(error);
      return {};
    });
  return emojiImages;
};
