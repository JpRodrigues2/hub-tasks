import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

// A documentação do site sai de content/docs, gerada a partir de ../instalacao (scripts/sincronizar-docs.mjs).
export const docs = defineDocs({ dir: 'content/docs' });

export default defineConfig();
