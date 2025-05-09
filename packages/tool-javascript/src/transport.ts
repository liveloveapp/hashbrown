import { QuickJSContext, QuickJSHandle } from 'quickjs-emscripten';

export class Transport {
  jsonHandle: QuickJSHandle;
  stringifyHandle: QuickJSHandle;
  parseHandle: QuickJSHandle;

  constructor(private readonly context: QuickJSContext) {
    const jsonResult = context.getProp(context.global, 'JSON');
    const stringifyResult = context.getProp(jsonResult, 'stringify');
    const parseResult = context.getProp(jsonResult, 'parse');

    this.jsonHandle = jsonResult;
    this.stringifyHandle = stringifyResult;
    this.parseHandle = parseResult;
  }

  sendObject(object: object) {
    const asString = JSON.stringify(object);
    const stringHandle = this.context.newString(asString);
    const result = this.context.callFunction(
      this.parseHandle,
      this.jsonHandle,
      stringHandle,
    );
    stringHandle.dispose();
    return result;
  }

  sendError(name: string, message: string) {
    return this.context.newError({ name, message });
  }

  receiveObject(handle: QuickJSHandle) {
    const result = this.context.callFunction(
      this.stringifyHandle,
      this.jsonHandle,
      handle,
    );
    const stringHandle = result.unwrap();
    const asString = this.context.getString(stringHandle);
    stringHandle.dispose();
    console.log('in tool javascript');
    return JSON.parse(asString);
  }
}
