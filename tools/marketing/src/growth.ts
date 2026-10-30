// Keep the runtime dependency relative so b4run's bundler inlines the
// workspace library into the closed function artifact.
// eslint-disable-next-line @nx/enforce-module-boundaries -- the relative edge is required in the emitted Vercel function
export * from '../../growth/src/index.ts';
