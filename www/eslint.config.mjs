import baseConfig from '../eslint.config.mjs';

export default [...baseConfig, { ignores: ['.next/**', 'next-env.d.ts'] }];
