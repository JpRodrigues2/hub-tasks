// Notificador pelo Telegram: mensagens em HTML no chat do usuário, botões como InlineKeyboard.
import { InlineKeyboard, type Api } from 'grammy';
import type { Notificador, Teclado } from '../../aplicacao/portas.js';
import { errInfo, log } from '../../logger.js';

const HTML = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

export function tecladoTelegram(t: Teclado): InlineKeyboard {
  return new InlineKeyboard(t.map((linha) => linha.map((b) => InlineKeyboard.text(b.texto, b.dado))));
}

export class NotificadorTelegram implements Notificador {
  constructor(
    private api: Api,
    private chatId: number,
  ) {}

  async enviar(html: string, teclado?: Teclado) {
    try {
      const m = await this.api.sendMessage(this.chatId, html, { ...HTML, ...(teclado ? { reply_markup: tecladoTelegram(teclado) } : {}) });
      return m.message_id;
    } catch (e) {
      log.error('telegram: falha ao enviar', errInfo(e));
      return null;
    }
  }

  async botoes(msgId: number, teclado?: Teclado) {
    await this.api.editMessageReplyMarkup(this.chatId, msgId, teclado ? { reply_markup: tecladoTelegram(teclado) } : undefined).catch(() => {});
  }
}
