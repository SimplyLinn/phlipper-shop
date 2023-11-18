import './SerialList';

interface SerialPortWithClosed extends SerialPort {
  closed?: boolean;
}

let port: SerialPortWithClosed | undefined,
  reader: ReadableStreamDefaultReader<Uint8Array> | null = null,
  readComplete = false,
  queueIdle = true;

interface ConnectMessage {
  operation: 'connect';
}

interface DisconnectMessage {
  operation: 'disconnect';
}

interface ReadMessage {
  operation: 'read';
  data?: string;
}

interface StopReadingMessage {
  operation: 'stop reading';
}

interface CliWriteMessage {
  operation: 'write';
  data: Omit<CliWrite, 'type'>;
}

interface RawWriteMessage {
  operation: 'write';
  data: Omit<RawWrite, 'type'>;
}

type MessageData =
  | ConnectMessage
  | DisconnectMessage
  | ReadMessage
  | StopReadingMessage
  | CliWriteMessage
  | RawWriteMessage;

self.addEventListener('message', (event: MessageEvent<MessageData>) => {
  console.log('message', event);
  switch (event.data.operation) {
    case 'connect':
      enqueue({
        type: 'connection',
        state: 'connect',
      });
      break;
    case 'disconnect':
      enqueue({
        type: 'connection',
        state: 'disconnect',
      });
      break;
    case 'read':
      read(event.data.data);
      break;
    case 'stop reading':
      reader?.cancel();
      break;
    case 'write':
      enqueue({
        type: 'write',
        ...event.data.data,
      });
      break;
  }
});

interface RawWrite {
  type: 'write';
  mode: 'raw';
  data: Uint8Array[];
}

interface CliWrite {
  type: 'write';
  mode: 'cli' | `cli/${string}`;
  data: string[];
}

interface ConnectionChange {
  type: 'connection';
  state: 'connect' | 'disconnect';
}

type Write = RawWrite | CliWrite;

type QueueEvent = Write | ConnectionChange;

function isCliWrite(write: Write): write is CliWrite {
  return write.mode === 'cli' || write.mode.startsWith('cli/');
}

let pendingConnectionChangePromise: Promise<void> | null = null;

const eventQueue: QueueEvent[] = [];

async function doConnect() {
  const filters = [{ usbVendorId: 0x0483, usbProductId: 0x5740 }];
  const ports = await navigator.serial.getPorts({ filters });
  const curPort: SerialPortWithClosed = ports[0];
  if (!curPort) {
    self.postMessage({
      operation: 'connect',
      status: 0,
      error: 'No known ports',
    });
    return;
  }
  port = curPort;
  curPort
    .open({ baudRate: 1 })
    .then(() => {
      if (curPort.closed) curPort.closed = false;
      self.postMessage({
        operation: 'connect',
        status: 1,
      });
    })
    .catch(async (error) => {
      if (error.toString().includes('The port is already open')) {
        await port?.close();
        return doConnect();
      } else {
        self.postMessage({
          operation: 'connect',
          status: 0,
          error: error,
        });
      }
    });
}

async function doDisconnect() {
  const curPort = port;
  if (curPort && !curPort.closed) {
    try {
      await reader?.cancel().catch(console.error);
      await curPort.close();
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.toString().includes('The port is already closed.')
      ) {
        self.postMessage({
          operation: 'disconnect',
          status: 0,
          error: error,
        });
      } else {
        curPort.closed = false;
        self.postMessage({
          operation: 'disconnect',
          status: 1,
        });
      }
    }
  }
}

function enqueue(entry: any) {
  eventQueue.push(entry);
  if (queueIdle) {
    runQueue();
  }
}

async function runQueue() {
  queueIdle = false;
  let event: QueueEvent | undefined;
  while ((event = eventQueue.shift())) {
    try {
      switch (event.type) {
        case 'connection':
          if (event.state === 'connect') {
            await doConnect();
          } else {
            await doDisconnect();
          }
          break;
        case 'write':
          await write(event);
          break;
      }
    } catch (error) {
      console.error(error);
    }
  }
  queueIdle = true;
}

async function write(entry: Write) {
  const curPort = port;
  if (!curPort) {
    self.postMessage({
      operation: 'write',
      status: 0,
      error: 'No port',
    });
    return;
  }
  if (!curPort.writable) {
    self.postMessage({
      operation: 'write',
      status: 0,
      error: 'Writable stream closed',
    });
    return;
  }
  const writer = curPort.writable.getWriter();

  if (isCliWrite(entry)) {
    if (entry.mode === 'cli/delimited') {
      entry.data.push('\r\n');
    }
    const encoder = new TextEncoder();
    entry.data.forEach(async (line: string, i: number) => {
      let message = line;
      if (entry.data[i + 1]) {
        message = line + '\r\n';
      }
      await writer.write(encoder.encode(message));
    });
  } else if (entry.mode === 'raw') {
    console.log('performing write', entry.data[0]);
    await writer.write(entry.data[0]);
  } else {
    throw new Error(
      `Unknown write mode: ${(entry as { mode?: unknown }).mode}`,
    );
  }

  await writer
    .close()
    .then(() => {
      self.postMessage({
        operation: 'write/end',
      });
      self.postMessage({
        operation: 'write',
        status: 1,
      });
    })
    .catch((error) => {
      self.postMessage({
        operation: 'write',
        status: 0,
        error: error,
      });
    });
}

async function read(mode?: string | null) {
  try {
    reader = port?.readable?.getReader() ?? null;
  } catch (error) {
    self.postMessage({
      operation: 'read',
      status: 0,
      error: error,
    });
    if (
      !(error instanceof Error) ||
      !error.toString().includes('locked to a reader')
    ) {
      throw error;
    }
  }
  if (!reader) {
    throw new Error('No reader');
  }
  const decoder = new TextDecoder();
  let buffer = new Uint8Array(0);
  readComplete = false;

  while (!readComplete) {
    await reader
      .read()
      .then(({ done, value }) => {
        if (done) {
          readComplete = true;
        } else {
          if (mode) {
            self.postMessage({
              operation: mode + ' output',
              data: value,
            });
          } else {
            const newBuffer = new Uint8Array(buffer.length + value.length);
            newBuffer.set(buffer);
            newBuffer.set(value, buffer.length);
            buffer = newBuffer;

            if (
              decoder
                .decode(buffer.slice(-12))
                .replace(/\s/g, '')
                .endsWith('>:\x07')
            ) {
              readComplete = true;
              self.postMessage({
                operation: 'read',
                data: 'read',
                status: 1,
              });
            }
          }
        }
      })
      .catch((error) => {
        if (error.toString().includes('The device has been lost.')) {
          readComplete = true;
        } else {
          throw error;
        }
      });
  }
  await reader
    .cancel()
    .then(() => {
      self.postMessage({
        operation: 'read',
        status: 1,
        data: buffer,
      });
    })
    .catch((error) => {
      self.postMessage({
        operation: 'read',
        status: 0,
        error: error,
      });
    });
}
