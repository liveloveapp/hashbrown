import type { QuickJSContext } from 'quickjs-emscripten-core';
import { installDateTimeFormat } from './intl/DateTimeFormat';

export async function installIntl(ctx: QuickJSContext) {
  const IntlHandle = ctx.newObject();
  ctx.setProp(ctx.global, 'Intl', IntlHandle);

  installDateTimeFormat(ctx);
}
