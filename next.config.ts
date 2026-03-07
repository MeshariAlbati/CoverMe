import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: [
    '@langchain/langgraph',
    '@langchain/core',
    '@langchain/anthropic',
    'langchain',
    'anthropic',
    'pdf-parse',
  ],
}

export default nextConfig
