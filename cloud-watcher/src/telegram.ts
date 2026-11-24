/** The Bot API, outbound only. The token sits in the URL, so no error text or log line ever carries it. */
const API_ROOT = "https://api.telegram.org";
const MAX_TEXT = 4096;

export interface SendResult {
  ok: boolean;
  retryAfter?: number;
  reason?: string;
}

export type Markup = { inline_keyboard: Array<Array<Record<string, string>>> };

export interface Bot {
  send(chatId: number, text: string, markup?: Markup): Promise<SendResult>;
  edit(chatId: number, messageId: number, text: string, markup: Markup): Promise<SendResult>;
  answer(callbackId: string, text: string): Promise<SendResult>;
}

async function call(token: string, method: string, payload: Record<string, unknown>): Promise<SendResult> {
  try {
    const res = await fetch(`${API_ROOT}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    let retryAfter: number | undefined;
    try {
      const body = (await res.json()) as { parameters?: { retry_after?: number } };
      retryAfter = body.parameters?.retry_after;
    } catch {
      retryAfter = undefined;
    }
    return { ok: false, reason: `http_${res.status}`, retryAfter };
  } catch (e) {
    return { ok: false, reason: (e as Error).name };
  }
}

export function makeBot(token: string): Bot {
  return {
    send: (chatId, text, markup) =>
      call(token, "sendMessage", {
        chat_id: chatId,
        text: text.slice(0, MAX_TEXT),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(markup ? { reply_markup: markup } : {}),
      }),
    edit: (chatId, messageId, text, markup) =>
      call(token, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text: text.slice(0, MAX_TEXT),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: markup,
      }),
    answer: (callbackId, text) => call(token, "answerCallbackQuery", { callback_query_id: callbackId, text: text.slice(0, 190) }),
  };
}
