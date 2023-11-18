import { logger, throbber } from './_compileProto/logger.js';

logger.info('Hello world!');
const throb = throbber.info('Hello throbber');
await new Promise((resolve) => setTimeout(resolve, 230));
const throb2 = throbber.info('Hello throbber2');
await new Promise((resolve) => setTimeout(resolve, 230));
logger.info('Test string 1');
await new Promise((resolve) => setTimeout(resolve, 230));
logger.info('Test string 2');
await new Promise((resolve) => setTimeout(resolve, 2000));
throb2.failed();
await new Promise((resolve) => setTimeout(resolve, 1500));
throb.done();
