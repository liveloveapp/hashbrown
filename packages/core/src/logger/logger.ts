export class Logger {
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  log(args: any) {
    if (this.enabled) console.log(args);
  }

  error(args: any) {
    if (this.enabled) console.error(args);
  }
}
