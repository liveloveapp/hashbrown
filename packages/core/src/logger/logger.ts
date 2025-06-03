export const TRACE_LEVEL = 0;
export const DEBUG_LEVEL = 1;
export const INFO_LEVEL = 2;
export const WARN_LEVEL = 3;
export const ERROR_LEVEL = 4;
export const NONE_LEVEL = 5;

export class Logger {
  logPathsEnabled: { [name: string]: number } = {};

  allLevel: number;

  constructor(logPathsEnabled: { [name: string]: number }) {
    this.logPathsEnabled = logPathsEnabled;

    this.allLevel = logPathsEnabled['all'] ?? NONE_LEVEL;
  }

  for(loggerName: string) {
    return {
      trace: (args: any) => {
        if (
          this.allLevel <= TRACE_LEVEL ||
          (this.logPathsEnabled[loggerName] &&
            this.logPathsEnabled[loggerName] <= TRACE_LEVEL)
        ) {
          console.trace(args);
        }
      },
      debug: (args: any) => {
        if (
          this.allLevel <= DEBUG_LEVEL ||
          (this.logPathsEnabled[loggerName] &&
            this.logPathsEnabled[loggerName] <= DEBUG_LEVEL)
        ) {
          console.debug(args);
        }
      },
      info: (args: any) => {
        if (
          this.allLevel <= INFO_LEVEL ||
          (this.logPathsEnabled[loggerName] &&
            this.logPathsEnabled[loggerName] <= INFO_LEVEL)
        ) {
          console.info(args);
        }
      },
      warn: (args: any) => {
        if (
          this.allLevel <= WARN_LEVEL ||
          (this.logPathsEnabled[loggerName] &&
            this.logPathsEnabled[loggerName] <= ERROR_LEVEL)
        ) {
          console.error(args);
        }
      },
      error: (args: any) => {
        if (
          this.allLevel <= ERROR_LEVEL ||
          (this.logPathsEnabled[loggerName] &&
            this.logPathsEnabled[loggerName] <= TRACE_LEVEL)
        ) {
          console.trace(args);
        }
      },
    };
  }

  // trace(args: any) {
  //   if (
  //     LOGGER_LEVEL_RANKING.indexOf(this.allLevel) >=
  //       LOGGER_LEVEL_RANKING.indexOf('trace') ||
  //     // TODO: how to get the log name from args?
  //     LOGGER_LEVEL_RANKING.indexOf(this.logPathsEnabled['']) >=
  //       LOGGER_LEVEL_RANKING.indexOf('trace')
  //   )
  //     console.trace(args);
  // }

  // debug(args: any) {
  //   if (this.allLevel === 'debug' || this.logPathsEnabled) console.debug(args);
  // }

  // info(args: any) {
  //   if (this.allLevel === 'info' || this.logPathsEnabled) console.info(args);
  // }

  // warn(args: any) {
  //   if (this.allLevel === 'warn' || this.logPathsEnabled) console.warn(args);
  // }

  // error(args: any) {
  //   if (this.allLevel === 'error' || this.logPathsEnabled) console.error(args);
  // }
}
