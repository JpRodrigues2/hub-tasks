import { describe, expect, it } from 'vitest';
import { extrairCodigoOAuth } from '../../src/pm/mcp-client.js';

describe('extrairCodigoOAuth (/pm_login)', () => {
  it('pega o code do endereço de retorno colado', () => {
    expect(extrairCodigoOAuth(' http://localhost:53682/callback?code=abc123XYZ&state=s1 ')).toBe('abc123XYZ');
  });

  it('endereço sem code', () => {
    expect(extrairCodigoOAuth('http://localhost:53682/callback?state=s1')).toBeNull();
  });

  it('retorno com erro do servidor de login', () => {
    expect(() => extrairCodigoOAuth('http://localhost:53682/callback?error=access_denied')).toThrow(/access_denied/);
  });
});
