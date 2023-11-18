'use client';

import * as flipper from '@/flipper/core';
import { useEffect, useRef, useState } from 'react';

class Connection {
  readonly active: boolean = true;
  readonly started: boolean = false;

  async start() {
    if (!this.active) {
      throw new Error('Connection is not active');
    }
    if (this.started) {
      throw new Error('Connection is already started');
    }
    Object.assign(this, { started: true });
    await flipper.connect();
  }

  async stop() {
    Object.assign(this, { active: false, started: false });
  }

  constructor() {}
}

export default function SerialProvider() {
  const [connection, setConnection] = useState<null | Connection>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let mounted = true;
    if (1 < 3) {
      return;
    }
    const newConnection = new Connection();
    setTimeout(() => {
      if (!mounted) {
        return;
      }
      newConnection.start().then(() => {
        if (mounted) setConnection(newConnection);
      });
    }, 10);
    return () => {
      mounted = false;
      newConnection.stop();
      setConnection(null);
    };
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) {
      console.error('no ctx');
      return;
    }
    const unbind = flipper.emitter.on('screen frame', (data: Uint8Array) => {
      const imageData = new ImageData(128, 64, { colorSpace: 'srgb' });
      // Data is in 1-bit format, 8 pixels per byte, 128x64
      for (let by = 0; by < 8; by++) {
        for (let bx = 0; bx < 128; bx++) {
          const byte = data[bx + by * 128];
          for (let bi = 0; bi < 8; bi++) {
            const bit = (byte >> (7 - bi)) & 1;
            const x = bx;
            const y = by * 8 + (7 - bi);
            const index = (y * 128 + x) * 4;
            imageData.data[index + 3] = 255 * bit;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    });
    return unbind;
  }, []);

  useEffect(() => {
    if (!connection || !connection.active) {
      return;
    }
  }, [connection]);
  return (
    <div className="flex flex-col items-center justify-center">
      <h1 className="text-4xl font-bold">SerialProvider</h1>
      <canvas
        width={128}
        height={64}
        ref={canvasRef}
        style={{ backgroundColor: 'white' }}
      />
    </div>
  );
}
