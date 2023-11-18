import { Operation } from './util';
import emitter from './emitter';

const operation = new Operation();
const filters = [{ usbVendorId: 0x0483, usbProductId: 0x5740 }];

declare global {
  namespace Serial {
    interface SearchFilter {
        usbVendorId?: number;
        usbProductId?: number;
    }
    interface SearchOptions {
      filters: SearchFilter[];
    }
  }

  interface Serial {
    getPorts(options?: Serial.SearchOptions): Promise<SerialPort[]>;
  }
}

let serial: Worker | undefined;

if (typeof Worker !== 'undefined') {
    serial = new Worker(new URL('./workers/webSerial.ts', import.meta.url));
    serial.onmessage = (e) => {
      if (e.data.operation === 'cli output') {
        emitter.emit('cli output', e.data.data);
      } else if (e.data.operation === 'raw output') {
      emitter.emit('raw output', e.data.data);
    } else if (e.data.operation === 'write/end') {
      emitter.emit('write/end');
    } else {
      try {
        operation.terminate(e.data);
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('No pending operation')) {
          console.warn(err.message);
        } else {
          console.error(err);
        }
      }
    }
  };
}

async function connect() {
  const curSerial = serial;
  if (curSerial == null) {
    throw new Error('No serial worker');
  }
  const ports = await navigator.serial.getPorts({ filters });
  if (ports.length === 0) {
    throw new Error('No known ports');
  }
  await operation.create(curSerial, 'connect');
}

async function disconnect() {
  const curSerial = serial;
  if (curSerial == null) {
    throw new Error('No serial worker');
  }
  const disconnect = operation.create(curSerial, 'disconnect');
  await disconnect;
}

async function write(mode: 'raw' | 'cli', data: unknown) {
  const curSerial = serial;
  if (curSerial == null) {
    throw new Error('No serial worker');
  }
  if (mode !== 'raw') {
    const write = operation.create(curSerial, 'write', {
      mode: mode,
      data: [data],
    });
    await write;
  } else {
    curSerial.postMessage({
      operation: 'write',
      data: { mode: mode, data: [data] },
    });
  }
}

function read(mode: 'raw') {
  if (serial == null) {
    throw new Error('No serial worker');
  }
  serial.postMessage({ operation: 'read', data: mode });
}

function closeReader() {
  if (serial == null) {
    throw new Error('No serial worker');
  }
  serial.postMessage({ operation: 'stop reading' });
}

export { connect, disconnect, write, read, closeReader };
