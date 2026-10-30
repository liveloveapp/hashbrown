import { config } from '@b4run/cli';

export default config({
  appDir: 'src/app',
  build: {
    targets: ['vercel'],
    vercel: { reconcileVercelJson: false, maxDuration: 60 },
  },
});
