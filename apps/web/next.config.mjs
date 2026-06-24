/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: "/upload-bills", destination: "/upload-orders", permanent: true }];
  },
};

export default nextConfig;
