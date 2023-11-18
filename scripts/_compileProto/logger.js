import { createLogger, Transport as _Transport, format } from 'winston';
import { MESSAGE, LEVEL, SPLAT } from 'triple-beam';
import jsonStringify from 'safe-stable-stringify';
import stripAnsi from 'strip-ansi';
import os from 'os';

/** @type {typeof import('winston').transport} */
const Transport = _Transport;

const THROBBER = Symbol('throbber');

/**
 * @typedef {{
 *   info: object;
 *   curString: string;
 *   stop(lastString: string): void;
 *   outStream: NodeJS.WriteStream;
 * }} ThrobberInstance
 */

/**
 * @type {Map<symbol, ThrobberInstance>}
 */
const activeThrobbers = new Map();

let lastLevel = null;
const outputFormat = format((info) => {
  const stringifiedRest = jsonStringify(
    Object.assign({}, info, {
      level: undefined,
      message: undefined,
      splat: undefined,
    }),
  );

  const padding = (info.padding && info.padding[info.level]) || '';
  if (stringifiedRest !== '{}') {
    info[MESSAGE] = `${
      lastLevel !== info[LEVEL]
        ? `${info[THROBBER] || lastLevel == null ? '' : '\n'}${info.level}:`
        : `${stripAnsi(info.level).replace(/./g, ' ')} `
    }${padding} ${info.message.replace(
      /\r\n|\n/,
      (s) => `${s}${stripAnsi(info.level).replace(/./g, ' ')} ${padding} `,
    )} ${stringifiedRest}`;
  } else {
    info[MESSAGE] = `${
      lastLevel !== info[LEVEL]
        ? `${info[THROBBER] || lastLevel == null ? '' : '\n'}${info.level}:`
        : `${stripAnsi(info.level).replace(/./g, ' ')} `
    }${padding} ${info.message.replace(
      /\r\n|\n/,
      (s) => `${s}${stripAnsi(info.level).replace(/./g, ' ')} ${padding} `,
    )}`;
  }
  lastLevel = info[THROBBER] ? lastLevel : info[LEVEL];
  return info;
});

const outputFormatter = outputFormat();

function exitHandler(options) {
  if (options.cleanup) {
    for (const throbber of activeThrobbers.values()) {
      throbber.outStream.write(
        '\n'.repeat(throbber.curString.split('\n').length + 1),
      );
      if (throbber.outStream.writableCorked) throbber.outStream.uncork();
    }
  }
  if (options.exit) {
    process.exit();
  }
}

// do something when app is closing
process.on('exit', exitHandler.bind(null, { cleanup: true }));

// catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, { exit: true }));

// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', exitHandler.bind(null, { exit: true }));
process.on('SIGUSR2', exitHandler.bind(null, { exit: true }));

/**
 * @param {Iterable<any>} iterable
 * @param {any} searchElement
 * @returns {[prevThrobber: ThrobberInstance, lineIndex: number]}
 */
function startLineOfThrobber(searchElement) {
  let lineIndex = 0;
  let prevThrobber = null;
  const lenEntries = [...activeThrobbers].map(([key, throbber]) => [
    key,
    throbber.curString.split('\n').length,
    throbber,
  ]);
  for (let i = 0; i < lenEntries.length; i++) {
    const [key, len, throbber] = lenEntries[i];
    if (key === searchElement) {
      return [prevThrobber, lineIndex];
    }
    lineIndex += len;
    prevThrobber = throbber;
  }
  return [null, -1];
}

function totalThrobberLines() {
  let lines = 0;
  for (const throbber of activeThrobbers.values()) {
    lines += throbber.curString.split('\n').length;
  }
  return lines;
}

class YourCustomTransport extends Transport {
  constructor(options) {
    super(options);

    // Expose the name of this Transport on the prototype
    this.name = options.name || 'console';
    this.stderrLevels = this._stringArrayToSet(options.stderrLevels);
    this.consoleWarnLevels = this._stringArrayToSet(options.consoleWarnLevels);
    this.eol = typeof options.eol === 'string' ? options.eol : os.EOL;

    this.setMaxListeners(30);
  }

  /**
   * Core logging method exposed to Winston.
   * @param {ThrobberInstance} throbber - TODO: add param description.
   * @returns {undefined}
   */
  _writeThrobber(throbber) {
    const curLevel = lastLevel;
    const outStream = throbber.outStream;
    let [prevThrobber, lineIndex] = startLineOfThrobber(
      throbber.info[THROBBER],
    );
    if (prevThrobber) {
      lastLevel = prevThrobber.info[LEVEL];
    } else {
      lastLevel = null;
    }
    if (lineIndex < 0) {
      throbber.stop();
      return;
    }
    const message = throbber.info.message;
    throbber.info.message = throbber.curString;
    throbber.info = outputFormatter.transform(throbber.info);
    const isCorked = outStream.writableCorked;
    if (!isCorked) outStream.cork();
    outStream.write('\x1b[s');
    outStream.write('\x1b[1B');
    if (lineIndex > 0) outStream.write(`\x1b[${lineIndex}B`);
    outStream.write('\r\x1b[K');
    const [firstLine, ...extraLines] = throbber.info[MESSAGE].split('\n');
    outStream.write(firstLine);
    for (const curLine of extraLines) {
      outStream.write('\n\x1b[K');
      outStream.write(curLine);
    }
    outStream.write('\x1b[u');
    throbber.info.message = message;
    lastLevel = curLevel;
    if (!isCorked) outStream.uncork();
  }

  _redrawThrobbers(outStream) {
    const lineIndex = totalThrobberLines();
    if (lineIndex === 0) return;
    outStream.write('\n'.repeat(lineIndex));
    outStream.write('\x1b[A'.repeat(lineIndex));
    for (const throbber of activeThrobbers.values()) {
      this._writeThrobber(throbber);
    }
  }

  /**
   * Core logging method exposed to Winston.
   * @param {NodeJS.WriteStream | undefined} outStream - TODO: add param description.
   * @param {Object} info - TODO: add param description.
   * @param {Function} callback - TODO: add param description.
   * @returns {undefined}
   */
  _startThrobber(outStream, info, callback) {
    if (!outStream) {
      throw new Error('No outStream');
    }
    const marker = info[THROBBER];
    if (!marker) throw new Error('No marker');
    if (activeThrobbers.has(marker)) {
      throw new Error('Already throbbering');
    }
    /** @type {NodeJS.Timeout} */
    let interval;
    const throbber = {
      outStream,
      info,
      curString: `${info.message}.`,
      stop(lastString) {
        clearInterval(interval);
        activeThrobbers.delete(marker);
        throbber.curString = '';
        const newMessage = {
          ...info,
          level: info[LEVEL],
          message: `${info.message}${lastString ? ` ${lastString}` : ''}`,
        };
        delete newMessage.curString;
        Object.getOwnPropertySymbols(newMessage).forEach((key) => {
          delete newMessage[key];
        });
        logger.logLevel(newMessage);
      },
    };
    let i = 0;
    interval = setInterval(() => {
      throbber.curString = `${info.message}.${'.'.repeat(i)}`;
      this._writeThrobber(throbber);
      i = (i + 1) % 3;
    }, 300);
    const lineIndex = totalThrobberLines();
    if (lineIndex < 0) {
      throbber.stop();
      return;
    }
    outStream.cork();
    outStream.write(`\x1b[${lineIndex}B`);
    const lines = throbber.curString.split('\n');
    for (const curLine of lines) {
      outStream.write('\n');
      outStream.write(curLine);
    }
    outStream.write(`\x1b[${lineIndex + lines.length}A\r`);
    outStream.uncork();
    activeThrobbers.set(marker, throbber);
    this._writeThrobber(throbber);
    if (callback) {
      callback();
    }
  }

  /**
   * Core logging method exposed to Winston.
   * @param {Object} info - TODO: add param description.
   * @param {Function} callback - TODO: add param description.
   * @returns {undefined}
   */
  log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    // Remark: what if there is no raw...?
    if (this.stderrLevels[info[LEVEL]]) {
      if (info[THROBBER]) {
        this._startThrobber(console._stderr, info, callback);
        return;
      }
      if (console._stderr) {
        // Node.js maps `process.stderr` to `console._stderr`.
        console._stderr.cork();
        console._stderr.write(
          `${info[MESSAGE]}${this.eol}`.replace(/\r\n|\n/, (s) => `${s}\x1b[K`),
        );
        this._redrawThrobbers(console._stderr);
        console._stderr.uncork();
      } else {
        // console.error adds a newline
        console.error(info[MESSAGE]);
      }

      if (callback) {
        callback();
      }
      return;
    } else if (this.consoleWarnLevels[info[LEVEL]]) {
      if (info[THROBBER]) {
        this._startThrobber(console._stderr, info, callback);
        return;
      }
      if (console._stderr) {
        // Node.js maps `process.stderr` to `console._stderr`.
        // in Node.js console.warn is an alias for console.error
        console._stderr.cork();
        console._stderr.write(
          `${info[MESSAGE]}${this.eol}`.replace(/\r\n|\n/, (s) => `${s}\x1b[K`),
        );
        this._redrawThrobbers(console._stderr);
        console._stderr.uncork();
      } else {
        // console.warn adds a newline
        console.warn(info[MESSAGE]);
      }

      if (callback) {
        callback();
      }
      return;
    }
    if (info[THROBBER]) {
      this._startThrobber(console._stdout, info, callback);
      return;
    }
    if (console._stdout) {
      // Node.js maps `process.stdout` to `console._stdout`.
      console._stdout.cork();
      console._stdout.write(
        `${info[MESSAGE]}${this.eol}`.replace(/\r\n|\n/, (s) => `${s}\x1b[K`),
      );
      this._redrawThrobbers(console._stdout);
      console._stdout.uncork();
    } else {
      // console.log adds a newline.
      console.log(info[MESSAGE]);
    }

    if (callback) {
      callback();
    }
  }

  /**
   * Returns a Set-like object with strArray's elements as keys (each with the
   * value true).
   * @param {Array} strArray - Array of Set-elements as strings.
   * @param {?string} [errMsg] - Custom error message thrown on invalid input.
   * @returns {Object} - TODO: add return description.
   * @private
   */
  _stringArrayToSet(strArray, errMsg) {
    if (!strArray) return {};

    errMsg =
      errMsg || 'Cannot make set from type other than Array of string elements';

    if (!Array.isArray(strArray)) {
      throw new Error(errMsg);
    }

    return strArray.reduce((set, el) => {
      if (typeof el !== 'string') {
        throw new Error(errMsg);
      }
      set[el] = true;

      return set;
    }, {});
  }
}

export const winstonLogger = createLogger({
  transports: [new YourCustomTransport({})],
  format: format.combine(format.splat(), format.colorize(), outputFormatter),
});

/** @type {import('winston').LogMethod} */
export const logLevel = winstonLogger.log.bind(winstonLogger);
/** @type {import('winston').LeveledLogMethod} */
export const silly = winstonLogger.silly.bind(winstonLogger);
/** @type {import('winston').LeveledLogMethod} */
export const debug = winstonLogger.debug.bind(winstonLogger);
/** @type {import('winston').LeveledLogMethod} */
export const verbose = winstonLogger.verbose.bind(winstonLogger);
/** @type {import('winston').LeveledLogMethod} */
export const http = winstonLogger.http.bind(winstonLogger);
/** @type {import('winston').LeveledLogMethod} */
export const info = winstonLogger.info.bind(winstonLogger);
/** @type {import('winston').LeveledLogMethod} */
export const warn = winstonLogger.warn.bind(winstonLogger);
/** @type {import('winston').LeveledLogMethod} */
export const error = winstonLogger.error.bind(winstonLogger);

export const logger = {
  logLevel,
  silly,
  debug,
  verbose,
  http,
  info,
  warn,
  error,
};

/**
 * @typedef {{
 *   (level: string, message: string, callback: import('winston').LogCallback): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 *   (level: string, message: string, meta: any, callback: import('winston').LogCallback): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 *   (level: string, message: string, ...meta: any[]): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 *   (entry: LogEntry): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 *   (level: string, message: any): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 * }} ThrobberMethod
 */
/**
 * @typedef {{
 *   (message: string, callback: import('winston').LogCallback): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 *   (message: string, meta: any, callback: import('winston').LogCallback): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 *   (message: string, ...meta: any[]): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 *   (message: any): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 *   (infoObject: object): { done(msg?: string): void; failed(msg?: string): void; stop(msg: string): void; };
 * }} LeveledThrobberMethod
 */

/**
 * @type {{
 *   [key in keyof typeof logger]: ThrobberMethod;
 * }}
 */
export const throbber = {
  logLevel(level, msg, ...splat) {
    const marker = Symbol('unique-throbber-marker');
    const resolver = {
      done(msg) {
        const throbber = activeThrobbers.get(marker);
        if (!throbber) {
          throw new Error('Throbber not running');
        }
        throbber.stop(msg || 'DONE!');
      },
      failed(msg) {
        const throbber = activeThrobbers.get(marker);
        if (!throbber) {
          throw new Error('Throbber not running');
        }
        throbber.stop(msg || 'FAILED!');
      },
      stop(msg) {
        const throbber = activeThrobbers.get(marker);
        if (!throbber) {
          throw new Error('Throbber not running');
        }
        throbber.stop(msg);
      },
    };
    // Optimize for the hotpath of logging JSON literals
    if (arguments.length === 1) {
      level[THROBBER] = marker;
      logLevel(level);
      return resolver;
    }

    // Slightly less hotpath, but worth optimizing for.
    if (arguments.length === 2) {
      if (msg && typeof msg === 'object') {
        msg[THROBBER] = marker;
        logLevel(level, msg);
        return resolver;
      }

      msg = { [THROBBER]: marker, level, message: msg };
      logLevel(level, msg);
      return resolver;
    }

    const [meta] = splat;
    if (typeof meta === 'object' && meta !== null) {
      // Extract tokens, if none available default to empty array to
      // ensure consistancy in expected results
      const tokens = msg && msg.match && msg.match(formatRegExp);

      if (!tokens) {
        const info = Object.assign({}, winstonLogger.defaultMeta, meta, {
          [THROBBER]: marker,
          [SPLAT]: splat,
          message: msg,
        });

        if (meta.message) info.message = `${info.message} ${meta.message}`;
        if (meta.stack) info.stack = meta.stack;

        logLevel(level, info);
        return resolver;
      }
    }

    logLevel(
      level,
      Object.assign({}, this.defaultMeta, {
        [THROBBER]: marker,
        [SPLAT]: splat,
        message: msg,
      }),
    );
    return resolver;
  },
  silly(...args) {
    return throbber.logLevel('silly', ...args);
  },
  debug(...args) {
    return throbber.logLevel('debug', ...args);
  },
  verbose(...args) {
    return throbber.logLevel('verbose', ...args);
  },
  http(...args) {
    return throbber.logLevel('http', ...args);
  },
  info(...args) {
    return throbber.logLevel('info', ...args);
  },
  warn(...args) {
    return throbber.logLevel('warn', ...args);
  },
  error(...args) {
    return throbber.logLevel('error', ...args);
  },
};
