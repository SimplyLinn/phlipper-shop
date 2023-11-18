import {
  FIRST_VERSION,
  LATEST_VERSION,
  PROTOBUF_VERSION,
  PROTOBUF_VERSIONS,
  loadProtobuf,
} from '@/flipper/proto-compiled';
import { AllVersionsInRange } from './Types';
import { FlipperRpcSerialPort, SerialState } from '../FlipperRpcSerialPort';
import { PB } from '@/flipper/proto-compiled/bootstrap';
import protobuf from 'protobufjs';
import { FlipperRPCApi } from './buildInterface';

function ContextualizeError<T>(context: string, error: T): T {
  if (!(error instanceof Error)) return error;
  if (!('stack' in error)) return error;
  const propDesc = Object.getOwnPropertyDescriptor(error, 'stack');
  if (propDesc && !propDesc.configurable) return error;
  if (!/\n$|\s$/.test(context)) {
    context += '\n';
  }
  if (!propDesc) {
    const proto = Object.getPrototypeOf(error);
    Object.defineProperty(error, 'stack', {
      get: new Proxy(function (this: any) {
        const val = Reflect.get(proto, 'stack', this);
        if (typeof val === 'string') {
          return `${context}${val}`;
        }
        return val;
      }, {}),
      set(val) {
        Object.defineProperty(error, 'stack', {
          value: val,
          writable: true,
        });
      },
      enumerable: false,
      configurable: true,
    });
  } else if (Object.hasOwn(propDesc, 'value')) {
    Object.defineProperty(error, 'stack', {
      value:
        typeof propDesc.value === 'string'
          ? `${context}${propDesc.value}`
          : propDesc.value,
    });
  } else if (typeof propDesc.get === 'function') {
    const getter = propDesc.get;
    const setter = propDesc.set;
    Object.defineProperty(error, 'stack', {
      get: new Proxy(function (this: any) {
        const val = Reflect.apply(getter, this, []);
        if (typeof val === 'string') {
          return `${context}${val}`;
        }
        return val;
      }, {}),
      ...(typeof setter === 'function'
        ? {
            set() {
              Object.defineProperty(error, 'stack', {
                get: getter,
                set: setter,
              });
            },
          }
        : null),
    });
  }
  return error;
}

function ensureError(thrown: unknown) {
  if (thrown instanceof Error) return thrown;
  if (
    typeof thrown === 'object' &&
    thrown != null &&
    'message' in thrown &&
    thrown.message === 'string'
  ) {
    const err = new Error(thrown.message);
    if ('stack' in thrown && typeof thrown.stack === 'string') {
      Object.defineProperty(err, 'stack', {
        value: thrown.stack,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
    if ('name' in thrown && typeof thrown.name === 'string') {
      Object.defineProperty(err, 'name', {
        value: thrown.name,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }
    return err;
  }
  return new Error(`Non-Error thrown: ${String(thrown)}`);
}

const ba = ContextualizeError('aoeu', { hello: 'hutenosa' });

export function instantiate(
  port: FlipperRpcSerialPort,
): Promise<FlipperRPCApi<[FIRST_VERSION, '...', LATEST_VERSION]>>;
export function instantiate<const Version extends PROTOBUF_VERSION>(
  port: FlipperRpcSerialPort,
  options:
    | { version: Version; force?: boolean }
    | { version: Version; requireExactMatch?: boolean },
): Promise<FlipperRPCApi<Version>>;
export function instantiate<const MinV extends PROTOBUF_VERSION>(
  port: FlipperRpcSerialPort,
  options:
    | { minVersion: MinV; requireExactMatch?: boolean }
    | {
        minVersion: MinV;
        fallbackVersion?: AllVersionsInRange<[MinV, '...', LATEST_VERSION]>;
      },
): Promise<FlipperRPCApi<[MinV, '...', LATEST_VERSION]>>;
export function instantiate<const MaxV extends PROTOBUF_VERSION>(
  port: FlipperRpcSerialPort,
  options:
    | { maxVersion: MaxV; requireExactMatch?: boolean }
    | {
        maxVersion: MaxV;
        fallbackVersion?: AllVersionsInRange<[FIRST_VERSION, '...', MaxV]>;
      },
): Promise<FlipperRPCApi<[FIRST_VERSION, '...', MaxV]>>;
export function instantiate<
  const MinV extends PROTOBUF_VERSION,
  const MaxV extends PROTOBUF_VERSION,
>(
  port: FlipperRpcSerialPort,
  options:
    | { minVersion: MinV; maxVersion: MaxV; requireExactMatch?: boolean }
    | {
        maxVersion: MaxV;
        fallbackVersion?: AllVersionsInRange<[MinV, '...', MaxV]>;
      },
): Promise<FlipperRPCApi<[MinV, '...', MaxV]>>;
export function instantiate(
  port: FlipperRpcSerialPort,
  options?: { requireExactMatch?: boolean; fallbackVersion?: PROTOBUF_VERSION },
): Promise<FlipperRPCApi<[FIRST_VERSION, '...', LATEST_VERSION]>>;
export function instantiate(
  port: FlipperRpcSerialPort,
  options?:
    | { version: PROTOBUF_VERSION; force?: boolean }
    | { version: PROTOBUF_VERSION; requireExactMatch?: boolean }
    | {
        minVersion?: PROTOBUF_VERSION;
        maxVersion?: PROTOBUF_VERSION;
        requireExactMatch?: boolean;
        fallbackVersion?: PROTOBUF_VERSION;
      },
): Promise<FlipperRPCApi<any>> {
  return new Promise<FlipperRPCApi<any>>((_resolve, _reject) => {
    const ACCEPTED_VERSIONS =
      options == null
        ? PROTOBUF_VERSIONS
        : (() => {
            if ('version' in options && options.version != null)
              return [options.version];
            const minVersion =
              options != null && 'minVersion' in options
                ? options.minVersion ?? null
                : null;
            const maxVersion =
              options != null && 'maxVersion' in options
                ? options.maxVersion ?? null
                : null;
            if (minVersion == null && maxVersion == null)
              return PROTOBUF_VERSIONS;
            const minVersionIndex = (() => {
              const index = PROTOBUF_VERSIONS.indexOf(
                minVersion ?? FIRST_VERSION,
              );
              if (index < 0)
                throw new Error(`Invalid minVersion ${minVersion}`);
              return index;
            })();
            const maxVersionIndex = (() => {
              const index = PROTOBUF_VERSIONS.indexOf(
                maxVersion ?? LATEST_VERSION,
              );
              if (index < 0)
                throw new Error(`Invalid maxVersion ${maxVersion}`);
              return index;
            })();
            if (minVersionIndex > maxVersionIndex) {
              throw new Error(
                `minVersion ${minVersion} is greater than maxVersion ${maxVersion}`,
              );
            }
            return PROTOBUF_VERSIONS.slice(
              minVersionIndex,
              maxVersionIndex + 1,
            );
          })();
    function isAcceptedVersion(
      version: string,
    ): version is (typeof ACCEPTED_VERSIONS)[number] {
      return ACCEPTED_VERSIONS.includes(version as PROTOBUF_VERSION);
    }
    const requireExactMatch =
      options != null &&
      'requireExactMatch' in options &&
      options.requireExactMatch;
    const forceVersion =
      options != null && 'force' in options ? options.version ?? null : null;
    const fallbackVersion = (() => {
      if (options == null) return null;
      if ('version' in options && options.version != null) return null;
      if ('fallbackVersion' in options && options.fallbackVersion != null)
        return options.fallbackVersion;
      return null;
    })();
    let fulfilled = false;
    function resolve(
      value: FlipperRPCApi<any> | PromiseLike<FlipperRPCApi<any>>,
    ) {
      if (fulfilled) return;
      fulfilled = true;
      _resolve(value);
    }
    function reject(reason: any) {
      if (fulfilled) return;
      fulfilled = true;
      _reject(reason);
    }
    let remainder: Uint8Array | null = null;
    const commandId = 0xbabe;
    const messages: PB.Main[] = [];
    async function tryClose() {
      if (port.state !== SerialState.Disconnected) {
        return port.close().catch((err) => {
          throw ContextualizeError('ERROR WHEN CLOSING PORT', err);
        });
      }
      try {
        console.warn('Consumer already detached');
      } catch (err) {
        throw ContextualizeError('ERROR WHEN DETACHING CONSUMER', err);
      }
    }
    function tryDetach() {
      try {
        if (!port.detachConsumer(onData)) {
          console.warn('Consumer already detached');
        }
      } catch (err) {
        throw ContextualizeError('ERROR WHEN DETACHING CONSUMER', err);
      }
    }
    async function finish(err: Error | null) {
      try {
        tryDetach();
      } catch (detachErr) {
        try {
          await tryClose();
        } catch (err) {
          console.error(err);
        }
        if (err) {
          console.error(detachErr);
          reject(err);
        } else {
          reject(detachErr);
        }
        return;
      } finally {
        if (err) {
          try {
            await tryClose();
          } catch (err) {
            console.error(err);
          }
          reject(err);
          return;
        }
      }
      if (remainder != null && remainder.length > 0) {
        port.unshiftData(remainder);
        remainder = null;
      }
      let protobufVersionMajor: number | null = null;
      let protobufVersionMinor: number | null = null;
      for (const message of messages) {
        if (message.commandStatus !== PB.CommandStatus.OK) {
          console.warn('Command failed', message);
          continue;
        }
        if (message.content !== 'systemDeviceInfoResponse') {
          console.warn('Unexpected response', message);
          continue;
        }
        if (message.systemDeviceInfoResponse == null) {
          console.warn('Missing systemDeviceInfoResponse', message);
          continue;
        }
        if (message.systemDeviceInfoResponse.key === 'protobuf_version_major') {
          if (message.systemDeviceInfoResponse.value == null) {
            console.warn('Missing protobuf_version_major value', message);
            continue;
          }
          if (!/^\d+$/.test(message.systemDeviceInfoResponse.value)) {
            console.warn(
              'Invalid protobuf_version_major value',
              message.systemDeviceInfoResponse.value,
            );
            continue;
          }
          const numMajor = parseInt(message.systemDeviceInfoResponse.value, 10);
          if (protobufVersionMajor != null) {
            console.warn(
              'Duplicate protobuf_version_major %d -> %d. Picking the latter.',
              protobufVersionMajor,
              numMajor,
            );
          }
          protobufVersionMajor = numMajor;
        }
        if (message.systemDeviceInfoResponse.key === 'protobuf_version_minor') {
          if (message.systemDeviceInfoResponse.value == null) {
            console.warn('Missing protobuf_version_minor value', message);
            continue;
          }
          if (!/^\d+$/.test(message.systemDeviceInfoResponse.value)) {
            console.warn(
              'Invalid protobuf_version_minor value',
              message.systemDeviceInfoResponse.value,
            );
            continue;
          }
          const numMinor = parseInt(message.systemDeviceInfoResponse.value, 10);
          if (protobufVersionMinor != null) {
            console.warn(
              'Duplicate protobuf_version_minor %d -> %d. Picking the latter.',
              protobufVersionMinor,
              numMinor,
            );
          }
          protobufVersionMinor = numMinor;
        }
      }
      if (protobufVersionMajor == null && protobufVersionMinor == null) {
        console.warn(
          'Missing protobuf version in response, assuming 0.1 (protobuf version response got introduced in 0.2)',
        );
        protobufVersionMajor = 0;
        protobufVersionMinor = 1;
      }
      if (protobufVersionMajor == null) {
        if (fallbackVersion != null) {
          console.warn(
            'Missing protobuf major version, falling back to %s',
            fallbackVersion,
          );
          return resolve(
            loadProtobuf(fallbackVersion).then(
              ({ PB }) => new FlipperRPCApi(port, fallbackVersion, PB.Main, {}),
            ),
          );
        }
        return reject(new Error('Missing protobuf major version'));
      }
      if (protobufVersionMinor == null) {
        if (fallbackVersion != null) {
          console.warn(
            'Missing protobuf minor version, falling back to %s',
            fallbackVersion,
          );
          return resolve(
            loadProtobuf(fallbackVersion).then(
              ({ PB }) => new FlipperRPCApi(port, fallbackVersion, PB.Main, {}),
            ),
          );
        }
        return reject(new Error('Missing protobuf minor version'));
      }
      const maybeProtobufVersion = `${protobufVersionMajor}.${protobufVersionMinor}`;
      if (isAcceptedVersion(maybeProtobufVersion)) {
        console.log(
          'Loading %s v%s matching device version (v%s)',
          FlipperRPCApi.name,
          maybeProtobufVersion,
          maybeProtobufVersion,
        );
        return resolve(
          loadProtobuf(maybeProtobufVersion).then(
            ({ PB }) =>
              new FlipperRPCApi(port, maybeProtobufVersion, PB.Main, {}),
          ),
        );
      } else if (!requireExactMatch) {
        console.warn(
          'Non-matching device version (v%s), attempting to find closest acceptable match...',
          maybeProtobufVersion,
        );
        let bestMatch: PROTOBUF_VERSION | null = null;
        for (const s of ACCEPTED_VERSIONS) {
          const [majorStr, minorStr] = s.split('.');
          if (
            !majorStr ||
            !/^\d+$/.test(majorStr) ||
            !minorStr ||
            !/^\d+$/.test(minorStr)
          ) {
            continue;
          }
          const major = parseInt(majorStr, 10);
          const minor = parseInt(minorStr, 10);
          if (major < protobufVersionMajor!) {
            continue;
          }
          if (major > protobufVersionMajor!) {
            break;
          }
          if (minor > protobufVersionMinor!) {
            break;
          }
          bestMatch = s;
        }
        if (bestMatch != null) {
          console.warn(
            'Using %s v%s closest match for device version (v%s)',
            FlipperRPCApi.name,
            bestMatch,
            maybeProtobufVersion,
          );
          return resolve(
            loadProtobuf(bestMatch).then(
              ({ PB }) => new FlipperRPCApi(port, bestMatch!, PB.Main, {}),
            ),
          );
        }
        if (fallbackVersion != null) {
          console.warn(
            'No suitable match for device version (v%s), falling back to %s v%s',
            maybeProtobufVersion,
            FlipperRPCApi.name,
            fallbackVersion,
          );
          return resolve(
            loadProtobuf(fallbackVersion).then(
              ({ PB }) => new FlipperRPCApi(port, fallbackVersion, PB.Main, {}),
            ),
          );
        }
        return reject(
          new Error(
            `Failed to find a suitable match for device version (v${maybeProtobufVersion})`,
          ),
        );
      } else if (fallbackVersion) {
        console.warn(
          'Non-matching device version (v%s), falling back to %s %s',
          maybeProtobufVersion,
          FlipperRPCApi.name,
          fallbackVersion,
        );
        return resolve(
          loadProtobuf(fallbackVersion).then(
            ({ PB }) => new FlipperRPCApi(port, fallbackVersion, PB.Main, {}),
          ),
        );
      }
      return reject(
        new Error(
          `Unsupported device version (v${maybeProtobufVersion}). Needs to be one of ${ACCEPTED_VERSIONS.map(
            (s) => `v${s}`,
          ).join(', ')}`,
        ),
      );
    }
    function onData(chunk: Uint8Array) {
      if (!remainder) {
        remainder = chunk;
      } else {
        const newRemainder = new Uint8Array(remainder.length + chunk.length);
        newRemainder.set(remainder);
        newRemainder.set(chunk, remainder.length);
        remainder = newRemainder;
      }
      while (remainder != null) {
        const reader: protobuf.Reader = new protobuf.Reader(remainder);
        try {
          const res = PB.Main.decodeDelimited(reader);
          remainder = reader.buf.slice(reader.pos);
          if (res.commandId === commandId) {
            messages.push(res);
            if (!res.hasNext) {
              finish(null);
            }
          } else if (res.commandId !== 0) {
            console.error(
              'Unexpected command response to command id',
              res.commandId,
            );
          } else {
            console.log(
              'Received event',
              res.content,
              res.content && res[res.content],
            );
          }
        } catch (err) {
          if (
            err instanceof RangeError &&
            err.message.startsWith('index out of range: ')
          ) {
            if (remainder.length < 16384) return;
            console.error('Refusing to parse message larger than 16kb');
          }
          finish(ensureError(err));
        }
      }
    }
    if (forceVersion != null) {
      console.warn(
        'Forcing protocol version %s, without checking device version',
        forceVersion,
      );
      return resolve(
        loadProtobuf(forceVersion).then(
          ({ PB }) => new FlipperRPCApi(port, forceVersion, PB.Main, {}),
        ),
      );
    } else {
      port.attachConsumer(onData);
      function onConnect() {
        const cmd = PB.Main.create({
          commandId,
          hasNext: false,
          systemDeviceInfoRequest: {},
        });
        port.write(PB.Main.encodeDelimited(cmd).finish());
      }
      if (port.isConnected) {
        onConnect();
      } else {
        port.open().then(onConnect);
      }
    }
  });
}
