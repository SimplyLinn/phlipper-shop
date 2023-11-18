import url from 'node:url';
import path from 'node:path';
import child_process from 'node:child_process';
import pbjs from 'protobufjs-cli/pbjs.js';
import fs from 'node:fs/promises';
import { info, warn, throbber, error } from './logger.js';

const validVersionRegex =
  /^(?:[1-9]\d*|0)\.(?:[1-9]\d*|0)(?:\.(?:[1-9]\d*|0)(?:[-_.].*)?)?(?:[-_].*)?$/;

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export const VERSIONS_DIR = path.join(
  PROJECT_ROOT,
  'src',
  'flipper',
  'proto-compiled',
  'v',
);

// Init the git submodule stuff
await (async () => {
  let fetchError;
  await Loader('Initializing git submodule', () =>
    runCmd('git', ['submodule', 'init', 'flipperzero-protobuf']).then(() =>
      runCmd(
        'git',
        ['fetch', '--tags', '--force', '--recurse-submodules=no'],
        null,
        path.join(PROJECT_ROOT, 'flipperzero-protobuf'),
      ).catch((err) => {
        fetchError = err ?? null;
      }),
    ),
  ).then(
    () => {
      if (typeof fetchError === 'undefined') return;
      // Not a fatal error, report it and continue
      error('Failed to fetch tags from upstream flipperzero-protobuf');
      if (fetchError instanceof Error && Array.isArray(fetchError.output)) {
        const stderr = [];
        for (const [buffer, data] of fetchError.output) {
          if (buffer === 'stderr') {
            stderr.push(data.toString('utf8'));
          }
        }
        if (stderr.length > 0) {
          error(stderr.join(''));
        }
      } else {
        error(fetchError);
      }
    },
    (err) => {
      error('Failed to init git submodule');
      if (err instanceof Error && Array.isArray(err.output)) {
        const stderr = [];
        for (const [buffer, data] of err.output) {
          if (buffer === 'stderr') {
            stderr.push(data.toString('utf8'));
          }
        }
        if (stderr.length > 0) {
          error(stderr.join(''));
        }
        if (err) error(err);
      } else {
        error(err);
      }
      process.exit(1);
    },
  );
})();

/**
 * @param {string[]} [extraTags]
 */
export async function* loadTags(extraTags) {
  const [tagMap, tagsToFetch] = await Loader('Getting git tags', async () => {
    await runCmd(
      'git',
      ['update-index', '--really-refresh'],
      null,
      path.join(PROJECT_ROOT, 'flipperzero-protobuf'),
    );
    const output = await runCmd(
      'git',
      ['status', '--porcelain=v1'],
      null,
      path.join(PROJECT_ROOT, 'flipperzero-protobuf'),
    );
    if (output.some(([, data]) => data.length > 0)) {
      warn(
        'flipperzero-protobuf is not clean! Refusing fetch upstream for build.',
      );
      return [Object.create(null), []];
    }
    return mapGitTags(extraTags);
  });
  for (const tagName of tagsToFetch) {
    if (!Object.hasOwn(tagMap, tagName)) {
      throw new Error(`Unknown version ${tagName}`);
    }
    const version = tagMap[tagName];
    const tagCommit = await runCmd(
      'git',
      ['rev-list', '-n', '1', `tags/${tagName}`],
      null,
      path.join(PROJECT_ROOT, 'flipperzero-protobuf'),
    ).then((output) =>
      Buffer.concat(output.map(([, data]) => data))
        .toString('utf8')
        .trim(),
    );
    const outDir = path.join(VERSIONS_DIR, version);
    if (!(await needsCompile(tagCommit, outDir))) {
      info('~~ Version %s already compiled, skipping', version);
      continue;
    }
    info('\n~~ Compiling protobuf version %s', version);
    const { done } = throbber.info('Compiling protobuf version %s', version);
    const srcFiles = await loadProtobufTag(tagName);
    yield {
      commit: tagCommit,
      version,
      outDir,
      srcFiles,
    };
    done();
  }
}

/**
 * @type {{
 *   lintText(source: string, path: string): Promise<import('eslint').ESLint.LintResult>;
 *   awaitingResponse: [id: number, resolve: (result: import('eslint').ESLint.LintResult | PromiseLike<import('eslint').ESLint.LintResult>) => void, reject: (err: unknown) => void][];
 *   cp: child_process.ChildProcessByStdio<null, null, null>;
 *   abort(err: unknown): void;
 *   spawned: [id: number, source: string, path: string][] | null;
 * } | null}
 */
let linter = null;

export function eslintText(source, filepath) {
  if (!linter) {
    /** @type {child_process.ChildProcessByStdio<null, null, null>} */
    const cp = child_process.fork(
      path.join(__dirname, 'eslint.js'),
      [filepath],
      {
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        cwd: PROJECT_ROOT,
      },
    );
    let idCounter = 0;
    /** @type {typeof linter} */
    const _linter = (linter = {
      lintText(source, filePath) {
        const id = idCounter++;
        return new Promise((_resolve, _reject) => {
          let fulfilled = false;
          /** @type {typeof _resolve} */
          const resolve = (val) => {
            try {
              if (!fulfilled) _resolve(val);
            } finally {
              fulfilled = true;
              const index = this.awaitingResponse.findIndex(
                ([, r]) => r === resolve,
              );
              if (index >= 0) this.awaitingResponse.splice(index, 1);
            }
          };
          /** @type {typeof _reject} */
          const reject = (err) => {
            try {
              if (!fulfilled) _reject(err);
            } finally {
              fulfilled = true;
              const index = this.awaitingResponse.findIndex(
                ([, , r]) => r === reject,
              );
              if (index >= 0) this.awaitingResponse.splice(index, 1);
            }
          };
          this.awaitingResponse.push([id, resolve, reject]);
          if (this.spawned) {
            this.spawned.push([id, source, filePath]);
          } else if (this.cp) {
            this.cp.send(
              {
                type: 'lint',
                id,
                source,
                filePath,
              },
              (err) => {
                if (err) reject(err);
              },
            );
          } else {
            reject(new Error('Linter is not initialized'));
          }
        });
      },
      awaitingResponse: [],
      cp,
      spawned: [],
      abort(err) {
        this.awaitingResponse.forEach(([, , reject]) => {
          try {
            reject(err);
          } catch (err) {
            error(err);
          }
        });
        this.awaitingResponse.length = 0;
        this.spawned = null;
        this.cp = null;
        linter = null;
        cp.kill('SIGKILL');
      },
    });
    cp.on('message', (message) => {
      if (typeof message !== 'object' || message === null) {
        error('Invalid message from eslint child process:', message);
        _linter.abort();
        return;
      }
      if (message.type === 'lint-response') {
        const { id, status, data } = message;
        const req = _linter.awaitingResponse.find(([resId]) => resId === id);
        if (!req) {
          warn(
            `Received response for unknown request id ${id} from eslint child process`,
          );
          return;
        }
        const [, resolve, reject] = req;
        if (status === 'success') {
          resolve(data);
        } else if (status === 'error') {
          const error = new Error(data.message);
          Object.assign(error, data);
          reject(error);
        } else {
          reject(
            new Error(
              `Received unknown response status ${status} from eslint child process`,
            ),
          );
        }
      } else if (message.type === 'error') {
        const { error: rawError } = message;
        const error = new Error(rawError.message);
        Object.assign(error, rawError);
        error('Received error from eslint child process:', error);
        _linter.abort(error);
      } else {
        error(
          `Received unknown message type ${message.type} from eslint child process`,
        );
        _linter.abort(new Error('Received unknown message type'));
      }
    });
    cp.on('spawn', () => {
      if (_linter.spawned) {
        const spawned = _linter.spawned;
        _linter.spawned = null;
        Promise.allSettled(
          spawned.map(([id, source, filePath]) => {
            return new Promise((resolve, reject) => {
              cp.send(
                {
                  type: 'lint',
                  id,
                  source,
                  filePath,
                },
                (err) => {
                  if (err) {
                    const req = _linter.awaitingResponse.find(
                      ([resId]) => resId === id,
                    );
                    if (req) req[2](err);
                    reject(err);
                  } else {
                    resolve();
                  }
                },
              );
            });
          }),
        ).then((results) => {
          const rejection = results.find(({ status }) => status === 'rejected');
          if (rejection) {
            _linter.abort(rejection);
          }
        });
      }
    });
    cp.on('error', (err) => {
      abort(err);
    });
    cp.on('close', (code, signal) => {
      if (linter === _linter) {
        abort(
          new Error(
            `Closed unexpectedly${
              code
                ? ` with code ${code}`
                : signal
                ? ` with signal ${signal}`
                : ''
            }`,
          ),
        );
      }
    });
    cp.on('disconnect', () => {
      if (linter === _linter) {
        abort(new Error('Disconnected unexpectedly'));
      }
    });
    cp.on('exit', (code, signal) => {
      if (linter === _linter) {
        abort(
          new Error(
            `Closed unexpectedly${
              code
                ? ` with code ${code}`
                : signal
                ? ` with signal ${signal}`
                : ''
            }`,
          ),
        );
      }
    });
  }
  if (linter) {
    return linter.lintText(source, filepath);
  }
  return Promise.reject(new Error('Linter is not initialized'));
}

export function stopEslint() {
  if (linter) {
    linter.abort(new Error('Linter was stopped'));
  }
}

/**
 * @param {string} tagName
 * @returns {Promise<string[]>}
 */
function loadProtobufTag(tagName) {
  return Loader(`Checking out flipperzero-protobuf#tags/${tagName}`, () =>
    runCmd(
      'git',
      ['checkout', `tags/${tagName}`],
      null,
      path.join(PROJECT_ROOT, 'flipperzero-protobuf'),
    )
      .then(() =>
        fs.readdir(path.join(PROJECT_ROOT, 'flipperzero-protobuf'), {
          withFileTypes: true,
        }),
      )
      .then((files) =>
        files
          .filter((f) => f.isFile() && f.name.endsWith('.proto'))
          .sort(({ name: a }, { name: b }) => (a < b ? -1 : a > b ? 1 : 0))
          .map(({ name }) =>
            path.join(PROJECT_ROOT, 'flipperzero-protobuf', name),
          ),
      ),
  );
}

export async function needsCompile(tagCommit, outDir) {
  if (
    !(await fs.stat(outDir).then(
      (s) => s.isDirectory(),
      (e) => {
        if (
          typeof e === 'object' &&
          e != null &&
          e instanceof Error &&
          'code' in e &&
          e.code === 'ENOENT'
        ) {
          return false;
        }
        throw e;
      },
    ))
  )
    return true;
  const hasAllFiles = await Promise.all([
    fs.stat(path.join(outDir, 'index.js')).then(
      (s) => s.isFile(),
      (e) => {
        if (
          typeof e === 'object' &&
          e != null &&
          e instanceof Error &&
          'code' in e &&
          e.code === 'ENOENT'
        ) {
          return false;
        }
        throw e;
      },
    ),
    fs.stat(path.join(outDir, 'index.d.ts')).then(
      (s) => s.isFile(),
      (e) => {
        if (
          typeof e === 'object' &&
          e != null &&
          e instanceof Error &&
          'code' in e &&
          e.code === 'ENOENT'
        ) {
          return false;
        }
        throw e;
      },
    ),
    fs.stat(path.join(outDir, '.git_commit')).then(
      (s) => s.isFile(),
      (e) => {
        if (
          typeof e === 'object' &&
          e != null &&
          e instanceof Error &&
          'code' in e &&
          e.code === 'ENOENT'
        ) {
          return false;
        }
        throw e;
      },
    ),
  ]).then((results) => results.every((b) => b));
  if (!hasAllFiles) return true;
  const existingCommit = await fs
    .readFile(path.join(outDir, '.git_commit'), 'utf8')
    .then((s) => s.trim());
  return tagCommit !== existingCommit;
}

/**
 * @param {string[]} versions
 */
export function makeProtobufVersions(versions) {
  const escapedVersions = versions.map((v) =>
    JSON.stringify(v).trim().replace(/^"|"$/g, ''),
  );
  return `/** @typedef {{${escapedVersions
    .map(
      (v) =>
        `"${v}":{[key in keyof import("./v/${v}")]:import("./v/${v}")[key]}`,
    )
    .join(',')}}} PROTOBUF_VERSION_MAP **/
export const PROTOBUF_VERSIONS = /** @type {const} */ (["${escapedVersions.join(
    '","',
  )}"]);
/** @typedef {typeof PROTOBUF_VERSIONS[number]} PROTOBUF_VERSION **/
${escapedVersions
  .map(
    (v) => `/**
 * @overload
 * @param {"${v}"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["${v}"]>}
 **/`,
  )
  .join('\n')}
/**
 * @template {\`\${keyof PROTOBUF_VERSION_MAP}\`} T
 * @overload
 * @param {T} version
 * @returns {Promise<PROTOBUF_VERSION_MAP[T]>}
 **/
/**
 * @template {\`\${keyof PROTOBUF_VERSION_MAP}\`} T
 * @param {T} version
 * @returns {Promise<typeof PROTOBUF_VERSION_MAP[T]>}
 **/
export function loadProtobuf(version) {
  return import(
    /* webpackChunkName: "protobuf-version" */
    /* webpackMode: "lazy-once" */
    \`./v/\${version}/index.js\`
  );
}
export const FIRST_VERSION = "${escapedVersions[0]}";
/** @typedef {typeof FIRST_VERSION} FIRST_VERSION **/
export const LATEST_VERSION = "${escapedVersions[escapedVersions.length - 1]}";
/** @typedef {typeof LATEST_VERSION} LATEST_VERSION **/
/**
 * @param {string} version
 * @returns {version is PROTOBUF_VERSION}
 **/
export function isValidVersion(version) {
  return PROTOBUF_VERSIONS.includes(version);
}
`;
}

/**
 * @template {unknown} T
 * @param {string} text
 * @param {((logger: {log(...args: any[]): void; warn(...args: any[]): void; err(...args: any[]): void;}) => Promise<T>) | Promise<T>} toAwait
 * @returns {Promise<T>}
 */
export async function Loader(text, toAwait) {
  const { done, failed } = throbber.info(text);
  return (typeof toAwait === 'function' ? toAwait() : toAwait).then(
    (res) => {
      done();
      return res;
    },
    (err) => {
      failed();
      throw err;
    },
  );
}

/**
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {string | Buffer | ReadableStream | null} [stdin]
 * @param {string} [cwd]
 * @returns {Promise<[buffer: 'stdout' | 'stderr', data: Buffer][]>}
 */
export function runCmd(cmd, args, stdin, cwd = PROJECT_ROOT) {
  return new Promise((resolve, reject) => {
    try {
      const cp = child_process.spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd,
      });
      /** @type {[buffer: 'stdout' | 'stderr', data: Buffer][]} */
      const output = [];
      cp.stdout.on(
        'data',
        /** @param {Buffer} data */ (data) => {
          output.push(['stdout', data]);
        },
      );
      cp.stderr.on(
        'data',
        /** @param {Buffer} data */ (data) => {
          output.push(['stderr', data]);
        },
      );
      cp.on('exit', (code) => {
        if (code !== 0) {
          reject(
            Object.assign(new Error(`${cmd} exited with code ${code}`), {
              cwd,
              args,
              code,
              output,
            }),
          );
        }
        resolve(output);
      });
      cp.on('error', (err) => reject(err));
      if (!cp.stdin.closed) {
        if (stdin instanceof Buffer || typeof stdin === 'string')
          cp.stdin.write(stdin, (err) =>
            err ? reject(err) : cp.stdin.end((err) => err && reject(err)),
          );
        if (stdin != null && 'pipe' in stdin) {
          stdin.pipe(cp.stdin);
        } else cp.stdin.end((err) => err && reject(err));
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * @param {string[] | null} extraTags
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function sortVersionsFancy(extraTags, a, b) {
  const aIsValid = validVersionRegex.test(a);
  const bIsValid = validVersionRegex.test(b);
  if (!aIsValid || !bIsValid) {
    if (aIsValid) return -1;
    if (bIsValid) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const [aMajor, aMinor, aPatch = null] = a
    .split('.')
    .map((s) => Number.parseInt(s.split(/[-_]/, 1)[0], 10));
  const [bMajor, bMinor, bPatch = null] = b
    .split('.')
    .map((s) => Number.parseInt(s.split(/[-_]/, 1)[0], 10));
  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  if (extraTags) {
    if (extraTags.includes(a) && !extraTags.includes(b)) return 1;
    if (extraTags.includes(b) && !extraTags.includes(a)) return -1;
  }
  if (aPatch === bPatch) return 0;
  if (aPatch === null) return 1;
  if (bPatch === null) return -1;
  return aPatch - bPatch;
}

/**
 * @type {(a: string, b: string) => number}
 */
export const sortVersions = sortVersionsFancy.bind(null, null);

/**
 * @param {string[]} extraTags
 * @returns {Promise<[versionTagMap: Record<string, string>, toFetch: string[]]>}
 */
async function mapGitTags(extraTags = []) {
  const tags = await runCmd(
    'git',
    ['tag', '--list'],
    null,
    path.join(PROJECT_ROOT, 'flipperzero-protobuf'),
  ).then((output) =>
    `${output
      .map(([, data]) => data.toString('utf8').trim())
      .join('')}\n0.2.2`.split(/\r?\n/),
  );

  const autoIncludeRegex =
    /^(?:[1-9]\d*|0)\.(?:[1-9]\d*|0)(?:\.(?:[1-9]\d*|0))?$/;

  const map = tags
    .filter((s) => {
      if (extraTags.includes(s)) return true;
      if (s === '0.0') return false;
      if (!autoIncludeRegex.test(s)) {
        warn(`Ignoring invalid git-tag: ${s}`);
        return false;
      }
      return true;
    })
    .sort(sortVersionsFancy.bind(null, extraTags))
    .reduceRight((acc, cur) => {
      if (!validVersionRegex.test(cur)) {
        if (!Object.hasOwn(acc, cur)) acc[cur] = cur;
      } else {
        const [major, minor] = cur
          .split('.')
          .map((s) => Number.parseInt(s.split(/[-_]/, 1)[0], 10));
        const key = `${major}.${minor}`;
        if (!Object.hasOwn(acc, key)) acc[key] = cur;
      }
      return acc;
    }, {});

  const reverseMap = Object.assign(
    Object.create(null),
    Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])),
  );
  if (extraTags.length > 0) {
    for (let i = extraTags.length - 1; i >= 0; i--) {
      if (!Object.hasOwn(reverseMap, extraTags[i])) {
        warn(
          'Ignoring specified version %s, not found in git tags',
          extraTags[i],
        );
        extraTags.splice(i, 1);
      }
    }
    if (extraTags.length === 0) {
      error(
        'No specified versions found in git tags, exiting without generating protobuf static module',
      );
      process.exit(1);
    }
  } else {
    extraTags.push(...Object.keys(reverseMap));
  }
  return [reverseMap, extraTags];
}

/**
 *
 * @param {string[]} args
 * @returns {Promise<string>}
 */
export function pbjsMain(args) {
  return new Promise((resolve, reject) =>
    pbjs.main(args, function (err, output) {
      if (err) reject(err);
      resolve(output ?? '');
    }),
  );
}

/**
 *
 * @param {string[]} args
 * @param {string} [stdin]
 * @returns {Promise<string>}
 */
export function pbtsMain(args, stdin) {
  return new Promise((resolve, reject) => {
    try {
      const ts = child_process.spawn(
        'node',
        [
          '-e',
          'var cli=require("protobufjs-cli/pbts.js");var ret=cli.main(process.argv.slice(1));if(typeof ret==="number")process.exit(ret);',
          '--',
          ...args,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      let output = '';
      let stdout = '';
      ts.stdout.on(
        'data',
        /** @param {Buffer} data */ (data) => {
          const str = data.toString('utf8');
          output += str;
          stdout += str;
        },
      );
      let stderr = '';
      ts.stderr.on(
        'data',
        /** @param {Buffer} data */ (data) => {
          const str = data.toString('utf8');
          output += str;
          stderr += str;
        },
      );
      ts.on('exit', (code) => {
        if (code !== 0) {
          reject(
            Object.assign(new Error(`pbts exited with code ${code}`), {
              code,
              output,
              stdout,
              stderr,
            }),
          );
        }
        resolve(output);
      });
      ts.on('error', (err) => reject(err));
      if (!ts.stdin.closed) {
        if (stdin != null)
          ts.stdin.write(stdin, (err) =>
            err ? reject(err) : ts.stdin.end((err) => err && reject(err)),
          );
        else ts.stdin.end((err) => err && reject(err));
      }
    } catch (err) {
      reject(err);
    }
  });
}

export function formatEslintMessage(
  srcLines,
  message,
  preContext = 3,
  postContext = preContext,
) {
  const startLine = message.line - 1;
  const startColumn = message.column - 1;
  const endLine =
    message.endLine != null && message.endColumn != null
      ? message.endLine - 1
      : startLine;
  const endColumn =
    message.endLine != null && message.endColumn != null
      ? message.endColumn - 1
      : startColumn;
  const lineNumCount = Math.min(
    endLine + postContext + 1,
    srcLines.length,
  ).toString(10).length;
  const outLines = srcLines
    .slice(Math.max(startLine - preContext, 0), startLine)
    .map(
      (l, i) =>
        `${(Math.max(startLine - preContext, 0) + i + 1)
          .toString(10)
          .padStart(lineNumCount, ' ')} | ${l}`,
    );
  if (startLine === endLine) {
    outLines.push(
      `${(startLine + 1).toString(10).padStart(lineNumCount, ' ')} | ${
        srcLines[startLine]
      }`,
      `${' '.repeat(lineNumCount)}   ${' '.repeat(startColumn)}${'^'.repeat(
        endColumn - startColumn + 1,
      )}`,
    );
  } else {
    outLines.push(
      `${(startLine + 1).toString(10).padStart(lineNumCount, ' ')} | ${
        srcLines[startLine]
      }`,
      `${' '.repeat(lineNumCount)}   ${' '.repeat(startColumn - 1)}${'^'.repeat(
        srcLines[startLine].length - startColumn,
      )}`,
    );
    for (let i = startLine + 1; i < endLine; i++) {
      outLines.push(
        `${i.toString(10).padStart(lineNumCount, ' ')} | ${srcLines[i]}`,
        `${' '.repeat(lineNumCount)}   ${'^'.repeat(srcLines[i].length)}`,
      );
    }
    outLines.push(
      `${(endLine + 1).toString(10).padStart(lineNumCount, ' ')} | ${
        srcLines[endLine]
      }`,
      `${' '.repeat(lineNumCount)}   ${'^'.repeat(endColumn)}`,
    );
  }
  outLines.push(
    ...srcLines
      .slice(endLine + 1, endLine + postContext + 1)
      .map(
        (l, i) =>
          `${(endLine + i + 2)
            .toString(10)
            .padStart(lineNumCount, ' ')} | ${l}`,
      ),
  );
  return outLines;
}
