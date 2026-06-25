import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    externalDir: true,
    // Keep mongoose as one Node module — avoids duplicate instances when importing @backend/*.
    serverComponentsExternalPackages: ["mongoose", "bcryptjs"],
  },
  webpack: (config, { isServer }) => {
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      ...(config.resolve.modules ?? []),
    ];
    config.resolve.alias = {
      ...config.resolve.alias,
      // openid-client (next-auth) expects lru-cache v6 constructor API; eslint hoists v10.
      "lru-cache": path.resolve(
        __dirname,
        "node_modules/openid-client/node_modules/lru-cache"
      ),
    };
    if (isServer) {
      config.resolve.alias.mongoose = path.resolve(
        __dirname,
        "node_modules/mongoose"
      );
    }
    return config;
  },
  async redirects() {
    return [{ source: "/upload-bills", destination: "/upload-orders", permanent: true }];
  },
};

export default nextConfig;
