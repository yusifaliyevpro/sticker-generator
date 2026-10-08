import type { TelegramFile } from "./types.ts";

export class BotTokenMissingError extends Error {
  message = "BOT_TOKEN is not set";
}

// Just the Bot API calls quote-api needs, in place of pulling in all of telegraf
export class Telegram {
  readonly #token: string | undefined;

  constructor(token: string | undefined) {
    this.#token = token;
  }

  async callApi<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.#token) throw new BotTokenMissingError();

    const res = await fetch(`https://api.telegram.org/bot${this.#token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as { ok: boolean; result: T; description?: string };
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
    return data.result;
  }

  async getFileLink(file: string | TelegramFile): Promise<string> {
    const fileId = typeof file === "string" ? file : file.file_id;
    const { file_path } = await this.callApi<{ file_path: string }>("getFile", { file_id: fileId });
    return `https://api.telegram.org/file/bot${this.#token}/${file_path}`;
  }

  getChat(chatId: number | undefined) {
    return this.callApi<{ photo?: { big_file_id: string } }>("getChat", { chat_id: chatId });
  }
}
