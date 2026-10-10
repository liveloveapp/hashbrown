import { createRunHandler, readRunOptions } from '../run-handler';

export default createRunHandler(readRunOptions(process.env));
