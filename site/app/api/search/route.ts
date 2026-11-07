// Busca da documentação, gerada no build (site estático): o navegador baixa o índice e busca sozinho.
import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '@/lib/source';

export const revalidate = false;
export const { staticGET: GET } = createFromSource(source, { language: 'portuguese' });
