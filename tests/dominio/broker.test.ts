import { describe, expect, it } from 'vitest';
import { classificar, decidir, ehProducao, idGamificacao } from '../../src/dominio/broker.js';

describe('política do broker', () => {
  it('classifica pelas anotações do MCP, na dúvida a mais restrita', () => {
    expect(classificar({ readOnlyHint: true })).toBe('leitura');
    expect(classificar({ readOnlyHint: false, destructiveHint: false })).toBe('escrita');
    expect(classificar({ readOnlyHint: false, destructiveHint: true })).toBe('destrutiva');
    expect(classificar({ readOnlyHint: false })).toBe('destrutiva');
    expect(classificar(undefined)).toBe('destrutiva');
  });

  it('destrutiva nunca; escrita em produção confirma; o resto passa', () => {
    expect(decidir('destrutiva', false)).toBe('negar');
    expect(decidir('destrutiva', true)).toBe('negar');
    expect(decidir('escrita', true)).toBe('confirmar');
    expect(decidir('escrita', false)).toBe('permitir');
    expect(decidir('leitura', true)).toBe('permitir');
  });

  it('produção pelo campo ambiente ou pelo nome', () => {
    expect(ehProducao({ nome: 'prod' })).toBe(true);
    expect(ehProducao({ nome: 'producao' })).toBe(true);
    expect(ehProducao({ nome: 'dev' })).toBe(false);
    expect(ehProducao({ nome: 'principal', ambiente: 'producao' })).toBe(true);
    expect(ehProducao({ nome: 'prod-copia', ambiente: 'dev' })).toBe(false);
  });

  it('id da gamificação', () => {
    expect(idGamificacao('teensmart-app', 'dev')).toBe('teensmart-app/dev');
  });
});
