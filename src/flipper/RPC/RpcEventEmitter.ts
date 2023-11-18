import type { VersionRange } from './Types';
import { ResolveMain } from './_internal/types';

export class RpcDataEvent<Version extends VersionRange> extends Event {
  constructor(readonly data: ResolveMain<Version>) {
    super('rpcData');
  }
}

export class RpcCommandResponseEvent<
  Version extends VersionRange,
> extends Event {
  constructor(
    readonly data: ResolveMain<Version>[],
    readonly commandId: number,
  ) {
    super('rpcCommandResponse');
  }
}

export class FlipperRpcEventEmitter<
  Version extends VersionRange,
> extends EventTarget {
  #listeners: [
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
    marker?: symbol,
  ][] = [];
  addEventListener(
    type: 'connect' | 'disconnect',
    listener: EventListenerOrEventListenerObject | null,
    useCapture?: boolean,
  ): void;
  addEventListener(
    type: 'rpcData',
    listener: (this: this, ev: RpcDataEvent<Version>) => any,
    useCapture?: boolean,
  ): void;
  addEventListener(
    type: 'rpcCommandResponse',
    listener: (this: this, ev: RpcCommandResponseEvent<Version>) => any,
    useCapture?: boolean,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    ...args: [
      type: string,
      listener: any,
      options?: boolean | AddEventListenerOptions,
    ]
  ) {
    try {
      return super.addEventListener(...args);
    } finally {
      const marker = Symbol();
      const newArgs: [
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
        marker?: symbol,
      ] = [...args];
      newArgs[2] = newArgs[2] ?? undefined;
      newArgs[3] = marker;
      this.#listeners.push(newArgs);
      if (typeof args[2] === 'object' && args[2] != null && args[2].signal) {
        args[2].signal.addEventListener('abort', () => {
          this.#listeners = this.#listeners.filter(
            ([, , , curMarker]) => curMarker !== marker,
          );
        });
      }
    }
  }
  removeEventListener(
    type: 'connect' | 'disconnect',
    listener: EventListenerOrEventListenerObject | null,
    useCapture?: boolean,
  ): void;
  removeEventListener(
    type: 'rpcData',
    listener: (this: this, ev: RpcDataEvent<Version>) => any,
    useCapture?: boolean,
  ): void;
  removeEventListener(
    type: 'rpcCommandResponse',
    listener: (this: this, ev: RpcCommandResponseEvent<Version>) => any,
    useCapture?: boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    ...args: [
      type: string,
      listener: any,
      options?: boolean | EventListenerOptions,
    ]
  ) {
    try {
      return super.removeEventListener(...args);
    } finally {
      this.#listeners = this.#listeners.filter(([type, listener, options]) => {
        if (type !== args[0] || listener !== args[1]) {
          return true;
        }
        const isCurCapture =
          options === true ||
          (typeof options === 'object' &&
            options != null &&
            options.capture === true);
        const isArgCapture =
          args[2] === true ||
          (typeof args[2] === 'object' &&
            args[2] != null &&
            args[2].capture === true);
        return isCurCapture !== isArgCapture;
      });
    }
  }

  dispatchEvent(event: Event): boolean {
    try {
      return super.dispatchEvent(event);
    } finally {
      this.#listeners = this.#listeners.filter(([type, listener, options]) => {
        if (type !== event.type) {
          return true;
        }
        return (
          typeof options === 'object' &&
          options != null &&
          options.once === true
        );
      });
    }
  }

  removeAllListeners(type?: string) {
    this.#listeners = this.#listeners.filter(([curType, listener, options]) => {
      if (type != null && type !== curType) return true;
      try {
        if (options != null) {
          super.removeEventListener(curType, listener, options);
        } else {
          super.removeEventListener(curType, listener);
        }
      } catch (err) {
        console.error(err);
        return true;
      }
      return false;
    });
  }
}
