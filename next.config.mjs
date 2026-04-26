/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config) => {
    // pdf-parse v1 内部 require('./test/data/...') 在 webpack 打包时会报错
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
