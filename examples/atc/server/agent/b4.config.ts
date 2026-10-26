import { config } from '@b4run/cli';

export default config({
  appDir: 'src/app',
  server: {
    agui: {
      clientTools: ['/atc'],
      clientForwardedProps: { '/atc': ['responseSchema'] },
      clientToolTtlMs: 600_000,
      clientToolRetentionMs: 86_400_000,
    },
  },
  build: {
    targets: ['vercel'],
    vercel: { reconcileVercelJson: false, maxDuration: 60 },
  },
});
