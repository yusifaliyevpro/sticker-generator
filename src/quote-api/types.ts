export type MessageEntity = { type: string; offset: number; length: number; custom_emoji_id?: string };

export type TelegramFile = { file_id: string; is_animated?: boolean; thumb?: TelegramFile; thumbnail?: TelegramFile };

export type QuoteUser = {
  id?: number;
  name?: string;
  first_name?: string;
  last_name?: string;
  title?: string;
  username?: string;
  emoji_status?: string;
  photo?: { url?: string; big_file_id?: string };
};

export type QuoteMessage = {
  from: QuoteUser;
  text?: string;
  entities?: MessageEntity[];
  avatar?: boolean;
  replyMessage?: { name?: string; text?: string; entities?: MessageEntity[]; chatId?: number };
  media?: { url: string } | (string | TelegramFile)[];
  mediaCrop?: boolean;
  mediaType?: string;
  voice?: { waveform: number[] };
};

export type QuoteParams = {
  messages?: QuoteMessage[];
  backgroundColor?: string;
  width?: number;
  height?: number;
  scale?: number | string;
  type?: string;
  format?: string;
  ext?: string;
  botToken?: string;
};

export type QuoteResult = {
  image?: string | Buffer;
  type?: string;
  width?: number;
  height?: number;
  ext?: string;
  error?: string;
};
