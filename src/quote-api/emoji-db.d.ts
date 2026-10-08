declare module "emoji-db" {
  type FoundEmoji = { found: string; offset: number; length: number; emoji?: string };

  export default class EmojiDb {
    constructor(options?: { useDefaultDb?: boolean; dbDir?: string; ignoreUnqualified?: boolean });
    dbData: Record<string, unknown>;
    searchFromText(options: { input: string; fixCodePoints?: boolean }): FoundEmoji[];
  }
}
