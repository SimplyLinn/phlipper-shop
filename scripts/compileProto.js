import path from 'node:path';
import fs from 'node:fs/promises';
import prettier from 'prettier';
import {
  Loader,
  loadTags,
  formatEslintMessage,
  pbjsMain,
  pbtsMain,
  VERSIONS_DIR,
  makeProtobufVersions,
  sortVersions,
  eslintText,
  stopEslint,
  PROJECT_ROOT,
} from './_compileProto/utils.js';
import { throbber, logger } from './_compileProto/logger.js';

async function doPrettier(data, filePath) {
  const config = await prettier.resolveConfig(filePath);
  return prettier.format(data, {
    ...config,
    filepath: filePath,
  });
}

try {
  for await (const tag of loadTags(process.argv.slice(2))) {
    const [strippedOutput, fullOutput] = await Loader(
      'Generating protobuf static module',
      () =>
        Promise.all([
          pbjsMain([
            '--target',
            'static-module',
            '--es6',
            '-w',
            'es6',
            ...tag.srcFiles,
            '--no-comments',
            '--lint',
            '',
          ]),
          pbjsMain([
            '--target',
            'static-module',
            '--es6',
            '-w',
            'es6',
            ...tag.srcFiles,
          ]),
        ]),
    );

    const tsOutput = await Loader('Generating typescript declarations', () =>
      pbtsMain(['-'], fullOutput),
    );

    const [lintJsOutput, lintTsOutput] = await Loader('Formatting output', () =>
      Promise.all([
        eslintText(strippedOutput, path.join(tag.outDir, 'index.js')).then(
          ([result]) => {
            if (result.fatalErrorCount > 0 || !result.output) {
              const firstFatal = result.messages.find((m) => m.fatal);
              if (firstFatal) {
                logger.error(firstFatal);
                logger.error(
                  formatEslintMessage(tsOutput.split(/\r?\n/), firstFatal).join(
                    '\n',
                  ),
                );
              }
              throw new Error('Failed to format prodobuf output!');
            }
            return doPrettier(result.output, path.join(tag.outDir, 'index.js'));
          },
        ),
        eslintText(tsOutput, path.join(tag.outDir, 'index.d.ts')).then(
          ([result]) => {
            if (result.fatalErrorCount > 0 || !result.output) {
              const firstFatal = result.messages.find((m) => m.fatal);
              if (firstFatal) {
                logger.error(firstFatal);
                logger.error(
                  formatEslintMessage(tsOutput.split(/\r?\n/), firstFatal).join(
                    '\n',
                  ),
                );
              }
              throw new Error(
                'Failed to format TypeScript declaration file output!',
              );
            }
            return doPrettier(
              result.output,
              path.join(tag.outDir, 'index.d.ts'),
            );
          },
        ),
      ]),
    );

    await Loader('Writing output', () =>
      fs
        .mkdir(tag.outDir, { recursive: true })
        .then(() => {
          Promise.all([
            fs.unlink(path.join(tag.outDir, 'index.js')).catch((e) => {
              if (e.code !== 'ENOENT') {
                throw e;
              }
            }),
            fs.unlink(path.join(tag.outDir, 'index.d.ts')).catch((e) => {
              if (e.code !== 'ENOENT') {
                throw e;
              }
            }),
            fs.unlink(path.join(tag.outDir, '.git_commit')).catch((e) => {
              if (e.code !== 'ENOENT') {
                throw e;
              }
            }),
          ]);
        })
        .then(() =>
          Promise.all([
            fs.writeFile(path.join(tag.outDir, 'index.js'), lintJsOutput),
            fs.writeFile(path.join(tag.outDir, 'index.d.ts'), lintTsOutput),
          ]),
        )
        .then(() =>
          fs.writeFile(path.join(tag.outDir, '.git_commit'), tag.commit),
        ),
    );
  }
} catch (e) {
  stopEslint();
  throw e;
}

logger.info('\n~~ Compiling protobuf bootstrap');
const { done, failed } = throbber.info('Compiling protobuf bootstrap');
try {
  const BOOTSTRAP_DIR = path.join(PROJECT_ROOT, 'flipperproto-bootstrap');
  const [strippedOutput, fullOutput] = await Loader(
    'Generating boostrap protobuf module',
    () =>
      fs
        .readdir(BOOTSTRAP_DIR, {
          withFileTypes: true,
        })
        .then((files) =>
          files
            .filter((f) => f.isFile() && f.name.endsWith('.proto'))
            .sort(({ name: a }, { name: b }) => (a < b ? -1 : a > b ? 1 : 0))
            .map(({ name }) => path.join(BOOTSTRAP_DIR, name)),
        )
        .then((srcFiles) =>
          Promise.all([
            pbjsMain([
              '--target',
              'static-module',
              '--es6',
              '-w',
              'es6',
              ...srcFiles,
              '--no-comments',
              '--lint',
              '',
            ]),
            pbjsMain([
              '--target',
              'static-module',
              '--es6',
              '-w',
              'es6',
              ...srcFiles,
            ]),
          ]),
        ),
  );
  const tsOutput = await Loader('Generating typescript declarations', () =>
    pbtsMain(['-'], fullOutput),
  );

  const outDir = path.resolve(VERSIONS_DIR, '..');

  const [lintJsOutput, lintTsOutput] = await Loader('Formatting output', () =>
    Promise.all([
      eslintText(strippedOutput, path.join(outDir, 'bootstrap.js')).then(
        ([result]) => {
          if (result.fatalErrorCount > 0 || !result.output) {
            const firstFatal = result.messages.find((m) => m.fatal);
            if (firstFatal) {
              logger.error(firstFatal);
              logger.error(
                formatEslintMessage(tsOutput.split(/\r?\n/), firstFatal).join(
                  '\n',
                ),
              );
            }
            throw new Error('Failed to format prodobuf output!');
          }
          return doPrettier(result.output, path.join(outDir, 'bootstrap.js'));
        },
      ),
      eslintText(tsOutput, path.join(outDir, 'bootstrap.d.ts')).then(
        ([result]) => {
          if (result.fatalErrorCount > 0 || !result.output) {
            const firstFatal = result.messages.find((m) => m.fatal);
            if (firstFatal) {
              logger.error(firstFatal);
              logger.error(
                formatEslintMessage(tsOutput.split(/\r?\n/), firstFatal).join(
                  '\n',
                ),
              );
            }
            throw new Error(
              'Failed to format TypeScript declaration file output!',
            );
          }
          return doPrettier(result.output, path.join(outDir, 'bootstrap.d.ts'));
        },
      ),
    ]),
  );

  await Loader('Writing output', () =>
    fs
      .mkdir(outDir, { recursive: true })
      .then(() => {
        Promise.all([
          fs.unlink(path.join(outDir, 'bootstrap.js')).catch((e) => {
            if (e.code !== 'ENOENT') {
              throw e;
            }
          }),
          fs.unlink(path.join(outDir, 'bootstrap.d.ts')).catch((e) => {
            if (e.code !== 'ENOENT') {
              throw e;
            }
          }),
        ]);
      })
      .then(() =>
        Promise.all([
          fs.writeFile(path.join(outDir, 'bootstrap.js'), lintJsOutput),
          fs.writeFile(path.join(outDir, 'bootstrap.d.ts'), lintTsOutput),
        ]),
      ),
  );
  done();
} catch (err) {
  failed();
  throw err;
} finally {
  stopEslint();
}

await Loader('Creating versions.js', async () => {
  const dir = await fs
    .readdir(VERSIONS_DIR, {
      withFileTypes: true,
    })
    .then((files) =>
      Promise.all(
        files
          .filter((f) => f.isDirectory())
          .map((f) =>
            fs
              .readdir(path.join(VERSIONS_DIR, f.name), {
                withFileTypes: true,
              })
              .then((f) => {
                const fileNames = f
                  .filter((f) => f.isFile())
                  .map((f) => f.name);
                return (
                  fileNames.includes('index.js') &&
                  fileNames.includes('index.d.ts')
                );
              })
              .then((hasIndex) => hasIndex && f.name),
          ),
      ).then((dirs) =>
        dirs
          .filter(/** @type {(d: string | false) => d is string} */ (d) => d)
          .sort(sortVersions),
      ),
    );
  const protobufVersionsJs = makeProtobufVersions(dir);
  const versionsJsPath = path.resolve(VERSIONS_DIR, '..', 'index.js');
  await fs.writeFile(
    versionsJsPath,
    await doPrettier(protobufVersionsJs, versionsJsPath),
  );
});
