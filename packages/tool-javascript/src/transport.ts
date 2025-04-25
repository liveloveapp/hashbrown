import { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';

export class Transport {
  jsonHandle: QuickJSHandle;
  stringifyHandle: QuickJSHandle;
  parseHandle: QuickJSHandle;

  constructor(private readonly context: QuickJSContext) {
    const jsonResult = context.evalCode('JSON');
    const stringifyResult = context.evalCode('JSON.stringify');
    const parseResult = context.evalCode('JSON.parse');

    this.jsonHandle = jsonResult.unwrap();
    this.stringifyHandle = stringifyResult.unwrap();
    this.parseHandle = parseResult.unwrap();
  }

  sendObject(object: object) {
    const asString = JSON.stringify(object);
    const result = this.context.evalCode(asString);
    return result.unwrap();
  }

  sendError(name: string, message: string) {
    return this.context.newError({ name, message });
  }

  receiveObject(handle: QuickJSHandle) {
    const result = this.context.callFunction(
      this.parseHandle,
      this.jsonHandle,
      handle,
    );
    return result.unwrap();
  }
}
