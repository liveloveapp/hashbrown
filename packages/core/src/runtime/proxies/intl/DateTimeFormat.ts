import type { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten-core';

export function installDateTimeFormat(ctx: QuickJSContext) {
  const formatHandle = ctx.newFunction(
    'format',
    (
      dateHandle: QuickJSHandle,
      localeHandle: QuickJSHandle,
      optionsHandle: QuickJSHandle,
    ) => {
      const date = ctx.dump(dateHandle);
      const locale = ctx.dump(localeHandle);
      const options = ctx.dump(optionsHandle);
      const result = new Intl.DateTimeFormat(locale, options).format(
        new Date(date),
      );
      return ctx.newString(result);
    },
  );

  ctx.setProp(ctx.global, '__hb__Intl.DateTimeFormat.format', formatHandle);

  ctx.evalCode(`
    class DateTimeFormat {
      constructor(locale, options) {
        this.locale = locale;
        this.options = options;
      }

      format(date) {
        return globalThis["__hb__Intl.DateTimeFormat.format"].call(
          this,
          date,
          this.locale,
          this.options
        );
      }
    }

    globalThis.Intl.DateTimeFormat = DateTimeFormat;
  `);
}
