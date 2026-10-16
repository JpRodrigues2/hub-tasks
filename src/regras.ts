// Regras de trabalho por empresa (B08): regras/funifier.md e regras/dac.md, incluídas em todo prompt.
// O João vê e edita pelo Telegram (/regras) trocando o texto inteiro; a versão anterior vai para data/regras-historico/.
//
// callback_data  g:<empresa>:ver | edit | ok | no
import { InlineKeyboard, type Api } from 'grammy';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, type App } from './config.js';
import { getMeta, setMeta, type DB } from './db.js';
import { log } from './logger.js';
import { ICONE, cartao } from './msg.js';
import { escapeHtml } from './resumo.js';

export type Empresa = App['empresa'];
const EMPRESAS: Empresa[] = ['funifier', 'dac'];
const NOME: Record<Empresa, string> = { funifier: 'Funifier', dac: 'DAC' };
const HTML = { parse_mode: 'HTML' as const, link_preview_options: { is_disabled: true } };

export const REGRAS_DIR = join(ROOT, 'regras');
const arquivo = (e: Empresa) => join(REGRAS_DIR, `${e}.md`);

export function lerRegras(empresa: Empresa): string {
  const f = arquivo(empresa);
  return existsSync(f) ? readFileSync(f, 'utf8').trim() : '';
}

// Corpo das regras para o prompt (sem o título "# Regras de trabalho — X" do arquivo).
export function regrasParaPrompt(empresa: Empresa): string {
  return lerRegras(empresa).replace(/^#[^\n]*\n+/, '').trim();
}

function salvarRegras(empresa: Empresa, texto: string) {
  const f = arquivo(empresa);
  if (existsSync(f)) {
    const hist = join(ROOT, 'data', 'regras-historico');
    mkdirSync(hist, { recursive: true });
    copyFileSync(f, join(hist, `${empresa}-${new Date().toISOString().replace(/[:.]/g, '-')}.md`));
  }
  mkdirSync(REGRAS_DIR, { recursive: true });
  writeFileSync(f, texto.trim() + '\n');
  log.info('regras: atualizadas', { empresa, caracteres: texto.length });
}

interface Conversa {
  empresa: Empresa;
  etapa: 'texto' | 'confirmar';
  texto?: string;
  msgId?: number;
}

export class Regras {
  constructor(
    private db: DB,
    private api: Api,
    private chatId: number,
  ) {}

  private conversa(): Conversa | null {
    const v = getMeta(this.db, 'regras_conversa');
    return v ? (JSON.parse(v) as Conversa) : null;
  }

  private async setConversa(c: Conversa | null) {
    const atual = this.conversa();
    if (atual?.msgId && atual.msgId !== c?.msgId) await this.api.editMessageReplyMarkup(this.chatId, atual.msgId).catch(() => {});
    setMeta(this.db, 'regras_conversa', c ? JSON.stringify(c) : '');
  }

  async comando() {
    const kb = new InlineKeyboard();
    for (const e of EMPRESAS) kb.text(`📄 ${NOME[e]}`, `g:${e}:ver`);
    await this.api.sendMessage(this.chatId, cartao({ icone: ICONE.regras, titulo: 'Regras de trabalho', rodape: 'Vão em todo prompt da empresa. Qual quer ver?' }), {
      ...HTML,
      reply_markup: kb,
    });
  }

  async onBotao(empresa: string, acao: string, msgId: number): Promise<string> {
    if (!EMPRESAS.includes(empresa as Empresa)) return 'Empresa inválida.';
    const e = empresa as Empresa;
    const conv = this.conversa();

    if (acao === 'ver') {
      const texto = lerRegras(e) || '(vazio)';
      await this.api.sendMessage(
        this.chatId,
        cartao({ icone: ICONE.regras, titulo: `Regras · ${NOME[e]}`, corpo: [`<pre>${escapeHtml(texto)}</pre>`], rodape: 'Toque no texto para copiar.' }),
        { ...HTML, reply_markup: new InlineKeyboard().text('✏️ Editar', `g:${e}:edit`) },
      );
      return NOME[e];
    }
    if (acao === 'edit') {
      await this.api.editMessageReplyMarkup(this.chatId, msgId).catch(() => {});
      const m = await this.api.sendMessage(
        this.chatId,
        cartao({ icone: ICONE.pergunta, titulo: `Novo texto das regras · ${NOME[e]}`, rodape: 'Copie o texto acima, altere o que quiser e mande de volta inteiro.' }),
        { ...HTML, reply_markup: new InlineKeyboard().text('✖ Cancelar', `g:${e}:no`) },
      );
      await this.setConversa({ empresa: e, etapa: 'texto', msgId: m.message_id });
      return 'Mande o texto';
    }
    if (!conv || conv.empresa !== e || conv.msgId !== msgId) return 'Essa pergunta já foi respondida.';
    if (acao === 'no') {
      await this.setConversa(null);
      await this.api.sendMessage(this.chatId, cartao({ icone: ICONE.cancelado, titulo: 'Regras mantidas' }), HTML);
      return 'Cancelado';
    }
    if (acao === 'ok' && conv.etapa === 'confirmar' && conv.texto) {
      salvarRegras(e, conv.texto);
      await this.setConversa(null);
      await this.api.sendMessage(
        this.chatId,
        cartao({ icone: ICONE.ok, titulo: `Regras salvas · ${NOME[e]}`, rodape: 'Valem a partir da próxima task despachada.' }),
        HTML,
      );
      return 'Salvo';
    }
    return 'Essa pergunta já foi respondida.';
  }

  async onTexto(texto: string): Promise<boolean> {
    const conv = this.conversa();
    if (!conv) return false;
    if (conv.etapa === 'confirmar') {
      await this.api.sendMessage(this.chatId, cartao({ icone: ICONE.aviso, titulo: 'Use Salvar ou Cancelar', rodape: 'Na mensagem das regras.' }), HTML);
      return true;
    }
    const t = texto.trim();
    if (t.length < 10) {
      await this.api.sendMessage(this.chatId, cartao({ icone: ICONE.aviso, titulo: 'Texto muito curto', rodape: 'Mande as regras completas, ou toque em Cancelar.' }), HTML);
      return true;
    }
    const m = await this.api.sendMessage(
      this.chatId,
      cartao({
        icone: ICONE.pergunta,
        titulo: `Salvar as regras · ${NOME[conv.empresa]}?`,
        contexto: [`${t.split('\n').length} linhas`],
        rodape: 'A versão atual fica guardada no histórico.',
      }),
      { ...HTML, reply_markup: new InlineKeyboard().text('✔ Salvar', `g:${conv.empresa}:ok`).text('✖ Cancelar', `g:${conv.empresa}:no`) },
    );
    await this.setConversa({ empresa: conv.empresa, etapa: 'confirmar', texto: t, msgId: m.message_id });
    return true;
  }
}
