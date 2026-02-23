
import path from 'path'
import type { NextConfig as NextConfigType } from "next";

const withBundleAnalyzer = require('@next/bundle-analyzer')({
    enabled: process.env.ANALYZE === 'true',
})

const NextConfig: NextConfigType = {
    allowedDevOrigins: ['karma'],
    outputFileTracingRoot: path.join(__dirname, '..'),

    experimental: {
        externalDir: true,
    },

    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: '**',
            },
        ],
    },

    env: {
        NEXT_TELEMETRY_DEBUG: '1',
        NEXT_TELEMETRY_DISABLED: '1',
    },

    // Exclure les fichiers problématiques
    webpack: (config, { isServer }) => {
        config.resolve.alias = {
            ...config.resolve.alias,
        };

        // Ignorer les fichiers de test et bench de thread-stream
        config.module.rules.push({
            test: /node_modules\/thread-stream\/(test|bench)/,
            use: 'null-loader',
        });

        return config;
    },

    //transpilePackages: ['pino', 'thread-stream'],
};


export default withBundleAnalyzer(NextConfig);
