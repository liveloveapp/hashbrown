export type LoggerLevel =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'none';

const LOGGER_LEVEL_RANKING: LoggerLevel[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'none',
];

export class Logger {
  logPathsEnabled: { [name: string]: LoggerLevel } = {};

  allLevel: LoggerLevel;

  constructor(logPathsEnabled: { [name: string]: LoggerLevel }) {
    this.logPathsEnabled = logPathsEnabled;

    this.allLevel = logPathsEnabled['all'];
  }

  trace(args: any) {
    if (
      LOGGER_LEVEL_RANKING.indexOf(this.allLevel) >=
        LOGGER_LEVEL_RANKING.indexOf('trace') ||
      // TODO: how to get the log name from args?
      LOGGER_LEVEL_RANKING.indexOf(this.logPathsEnabled['']) >=
        LOGGER_LEVEL_RANKING.indexOf('trace')
    )
      console.trace(args);
  }

  debug(args: any) {
    if (this.allLevel === 'debug' || this.logPathsEnabled) console.debug(args);
  }

  info(args: any) {
    if (this.allLevel === 'info' || this.logPathsEnabled) console.info(args);
  }

  warn(args: any) {
    if (this.allLevel === 'warn' || this.logPathsEnabled) console.warn(args);
  }

  error(args: any) {
    if (this.allLevel === 'error' || this.logPathsEnabled) console.error(args);
  }
}
