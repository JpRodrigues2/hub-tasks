import { describe, expect, it } from 'vitest';
import { classificarTela, extrairResultado, ultimasLinhas } from '../../src/dominio/tela.js';
import { TELAS, blocoResultado } from './telas.js';

describe('classificarTela', () => {
  it('caixa de entrada vazia = ocioso', () => {
    expect(classificarTela(TELAS.ocioso)).toBe('ocioso');
  });

  it('spinner com "esc to interrupt" = ocupado', () => {
    expect(classificarTela(TELAS.ocupado)).toBe('ocupado');
  });

  it('diálogo de permissão = aguardando, mesmo com ❯ na tela', () => {
    expect(classificarTela(TELAS.permissao)).toBe('aguardando');
  });

  it('diálogo tem prioridade sobre o agente "working" do Orca', () => {
    expect(classificarTela(TELAS.permissao, 'working')).toBe('aguardando');
  });

  it.each([TELAS.limite, TELAS.limite5h])('mensagem de limite = limite', (tela) => {
    expect(classificarTela(tela)).toBe('limite');
  });

  it('agente "working" no Orca = ocupado no acompanhamento', () => {
    expect(classificarTela(TELAS.ocioso, 'working')).toBe('ocupado');
  });

  it('shell em segundo plano: ocupado no acompanhamento, ocioso na hora de enviar', () => {
    expect(classificarTela(TELAS.shellRodando)).toBe('ocupado');
    expect(classificarTela(TELAS.shellRodando, 'working', true)).toBe('ocioso');
  });

  it('prompt do zsh sem a caixa do Claude não é ocioso', () => {
    expect(classificarTela(TELAS.zsh)).toBe('ocupado');
  });

  it('tela desconhecida ou vazia = ocupado (conservador: não envia)', () => {
    expect(classificarTela(TELAS.vazia)).toBe('ocupado');
    expect(classificarTela('algo inesperado')).toBe('ocupado');
  });

  it('só olha o fim da tela: um "usage limit reached" antigo na conversa não conta', () => {
    const antiga = ['Claude usage limit reached.', ...Array(20).fill('⏺ linha de conversa'), TELAS.ocioso].join('\n');
    expect(classificarTela(antiga)).toBe('ocioso');
  });
});

describe('extrairResultado', () => {
  it('lê os campos do bloco, juntando linhas quebradas pelo terminal', () => {
    expect(extrairResultado(blocoResultado('12'), '12')).toEqual({
      task: '#12',
      status: 'concluido',
      resumo: 'Ajustei o ranking e os testes passam.',
      arquivos: 'src/ranking.ts',
      branch: 'feat/ranking',
      pendencias: 'nenhuma',
    });
  });

  it('ignora o bloco de outra task ou de outra rodada', () => {
    expect(extrairResultado(blocoResultado('12'), '12.2')).toBeNull();
    expect(extrairResultado(blocoResultado('11'), '12')).toBeNull();
  });

  it('ignora o enunciado do formato (status com as opções)', () => {
    expect(extrairResultado(blocoResultado('12', 'concluido | bloqueado | precisa_revisao'), '12')).toBeNull();
  });

  it('usa o último bloco da tela', () => {
    const tela = [blocoResultado('12'), blocoResultado('12.2', 'bloqueado')].join('\n');
    expect(extrairResultado(tela, '12.2')?.status).toBe('bloqueado');
  });

  it('sem bloco = null', () => {
    expect(extrairResultado(TELAS.ocioso, '12')).toBeNull();
  });
});

describe('ultimasLinhas', () => {
  it('tira a caixa de entrada e o rodapé, e corta linhas longas', () => {
    const out = ultimasLinhas(['⏺ ' + 'x'.repeat(200), TELAS.ocioso].join('\n'));
    expect(out).not.toMatch(/─{5,}|auto mode/);
    expect(out.split('\n').every((l) => l.length <= 110)).toBe(true);
  });
});
