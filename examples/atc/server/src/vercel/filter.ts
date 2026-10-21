import { createFilterHandler } from '../filter-handler';
import { readRunOptions } from '../run-handler';

export default createFilterHandler(readRunOptions(process.env));
