import type { NextConfig } from 'next';

// Site estático (sem servidor): o build vira arquivos em out/, que a Vercel (ou qualquer hospedagem) serve.
const config: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
};

export default config;
