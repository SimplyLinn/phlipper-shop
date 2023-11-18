import {
  HEATSHRINK_MAX_WINDOW_BITS,
  HEATSHRINK_MIN_LOOKAHEAD_BITS,
  HEATSHRINK_MIN_WINDOW_BITS,
  HeatshrinkByteArray,
  HeatshrinkIOBuffer,
} from "./common.js";

enum HSD_state {
  TAG_BIT /* tag bit */,
  YIELD_LITERAL /* ready to yield literal byte */,
  BACKREF_INDEX_MSB /* most significant byte of index */,
  BACKREF_INDEX_LSB /* least significant byte of index */,
  BACKREF_COUNT_MSB /* most significant byte of count */,
  BACKREF_COUNT_LSB /* least significant byte of count */,
  YIELD_BACKREF /* ready to yield back-reference */,
}

enum HSD_poll_res {
  POLL_EMPTY /* input exhausted */,
  POLL_MORE /* more data remaining, call again w/ fresh output buffer */,
}

enum HSD_finish_res {
  FINISH_DONE /* output is done */,
  FINISH_MORE /* more output remains */,
}

interface HeatshrinkDecoderConfig {
  /** How big the input buffer should be? */
  inputBufferSize?: number;
  /** How big the output buffer should be? */
  outputBufferSize?: number;
  /** How many bits to support */
  windowSize2?: number;
  /** How many bits to look ahead */
  lookaheadSize2?: number;
}

new Uint8Array()

class HeatshrinkDecoderWindowBuffer extends HeatshrinkByteArray {
  private mask;
  private head = 0;
  private negOffset = 0;

  constructor();
  constructor(elements: Iterable<number>);
  constructor(length: number);
  constructor(array: ArrayLike<number> | ArrayBufferLike);
  constructor(buffer: ArrayBufferLike, byteOffset?: number, length?: number);
  constructor(...args: ConstructorParameters<Uint8ArrayConstructor>) {
    super(...args);
    this.mask = this.length - 1;
  }
  
  zeroNegOffset() {
    this.negOffset = 0;
  }

  yieldLiteral(byte: number) {
    const c = byte & 0xFF;
    this[this.head++ & this.mask] = c;
    return c;
  }

  backrefIndexMsb(bits: number) {
    this.negOffset = bits << 8;
  }

  backrefIndexLsb(bits: number) {
    this.negOffset |= bits;
    this.negOffset++;
  }

  yieldBackref() {
    const c = this[(this.head - this.negOffset) & this.mask];
    this[this.head & this.mask] = c;
    this.head++;
    return c;
  }

  reset() {
    super.reset();
    this.head = 0;
    this.negOffset = 0;
  }
}

class HeatshrinkDecoderInputBuffer extends HeatshrinkIOBuffer {
  static readonly NO_BITS = Symbol('NO BITS')
  private currentByte = 0;
  private bitIndex = 0;

  getBits(count: number) {
    let acc = 0;
    let i = 0;
    if (count > 15) {
      return HeatshrinkDecoderInputBuffer.NO_BITS;
    }
    if (this.size === 0 && this.bitIndex < (1 << (count - 1))) {
      return HeatshrinkDecoderInputBuffer.NO_BITS;
    }

    for (i = 0; i < count; i++) {
      if (this.bitIndex === 0x00) {
        if (this.size === 0) {
          return HeatshrinkDecoderInputBuffer.NO_BITS;
        }
        this.currentByte = this[this.head++];
        if (this.head === this.size) {
          this.head = 0; /* input is exhausted */
          this.size = 0;
        }
        this.bitIndex = 0x80;
      }
      acc <<= 1;
      if (this.currentByte & this.bitIndex) {
        acc |= 0x01;
      }
      this.bitIndex >>= 1;
    }
    return acc;
  }

  sink(input: Uint8Array): number {
    const remaining = this.length - this.size;
    if (remaining <= 0) {
      return 0;
    }
    const size = Math.min(input.length, remaining);
    this.copyFrom(input, 0, this.size, size);
    this.size += size;
    return size;
  }

  reset() {
    super.reset();
    this.currentByte = 0;
    this.bitIndex = 0;
  }
}

export default class HeatshrinkDecoder {
  private outputCount: number = 0;
  private _state: HSD_state = HSD_state.TAG_BIT;

  readonly bytes: Uint8Array;

  private inputBuffer: HeatshrinkDecoderInputBuffer;
  private windowBuffer: HeatshrinkDecoderWindowBuffer;
  private outputBuffer: HeatshrinkIOBuffer;

  public readonly windowSize2: number;

  get inputBufferSize() {
    return this.inputBuffer.length;
  }

  get outputBufferSize() {
    return this.outputBuffer.length;
  }

  public readonly lookaheadSize2: number;

  get state() {
    return this._state;
  }

  /**
   * 
   * @param inputBufferSize The size of the input buffer in bytes
   * @param windowSize2 The square root of the window size (2^windowSize2)
   * @param lookaheadSize2 The square root of the lookahead size (2^lookaheadSize2)
   */
  constructor({
    outputBufferSize = 128,
    inputBufferSize = 128,
    windowSize2 = 8,
    lookaheadSize2 = 4,
  }: HeatshrinkDecoderConfig
  ) {
    if (
      windowSize2 < HEATSHRINK_MIN_WINDOW_BITS ||
      windowSize2 > HEATSHRINK_MAX_WINDOW_BITS
    ) {
      throw new RangeError(
        `Invalid window size ${windowSize2}, must be between ${HEATSHRINK_MIN_WINDOW_BITS} and ${HEATSHRINK_MAX_WINDOW_BITS}`
      );
    }
    if (
      lookaheadSize2 < HEATSHRINK_MIN_LOOKAHEAD_BITS ||
      lookaheadSize2 >= windowSize2
    ) {
      throw new RangeError(
        `Invalid lookahead size ${lookaheadSize2}, must be between ${HEATSHRINK_MIN_LOOKAHEAD_BITS} and windowSize${windowSize2}`
      );
    }
    const windowSize = 1 << windowSize2;

    this.bytes = new Uint8Array(inputBufferSize + windowSize + outputBufferSize);
    const { buffer, byteOffset } = this.bytes;
    this.windowSize2 = windowSize2;
    this.inputBuffer = new HeatshrinkDecoderInputBuffer(buffer, byteOffset, inputBufferSize);
    this.windowBuffer = new HeatshrinkDecoderWindowBuffer(buffer, byteOffset + inputBufferSize, windowSize);
    this.outputBuffer = new HeatshrinkIOBuffer(buffer, byteOffset + inputBufferSize + windowSize, outputBufferSize);
    this.lookaheadSize2 = lookaheadSize2;
    this.reset();
  }

  reset() {
    this._state = HSD_state.TAG_BIT;
    this.outputCount = 0;
    this.inputBuffer.reset();
    this.windowBuffer.reset();
    this.outputBuffer.reset();
  }

  private tagBit() {
    const bits = this.inputBuffer.getBits(1);  // get tag bit
    if (bits === HeatshrinkDecoderInputBuffer.NO_BITS) {
      return HSD_state.TAG_BIT;
    } else if (bits) {
      return HSD_state.YIELD_LITERAL;
    } else if (this.windowSize2 > 8) {
      return HSD_state.BACKREF_INDEX_MSB;
    } else {
      this.windowBuffer.zeroNegOffset();
      return HSD_state.BACKREF_INDEX_LSB;
    }
  }

  private yieldLiteral() {
    /* Emit a repeated section from the window buffer, and add it (again)
     * to the window buffer. (Note that the repetition can include
     * itself.)*/
    if (this.outputBuffer.size < this.outputBuffer.length) {
      const byte = this.inputBuffer.getBits(8);
      if (byte === HeatshrinkDecoderInputBuffer.NO_BITS) { return HSD_state.YIELD_LITERAL; } /* out of input */
      const c = this.windowBuffer.yieldLiteral(byte);
      this.outputBuffer.pushByte(c);
      return HSD_state.TAG_BIT;
    }
    return HSD_state.YIELD_LITERAL;
  }

  private backrefIndexMsb() {
    const bitCount = this.windowSize2;
    const bits = this.inputBuffer.getBits(bitCount - 8);
    if (bits === HeatshrinkDecoderInputBuffer.NO_BITS) { return HSD_state.BACKREF_INDEX_MSB; }
    this.windowBuffer.backrefIndexMsb(bits);
    return HSD_state.BACKREF_INDEX_LSB;
  }

  private backrefIndexLsb() {
    const bitCount = this.windowSize2;
    const bits = this.inputBuffer.getBits(Math.min(bitCount, 8));
    if (bits === HeatshrinkDecoderInputBuffer.NO_BITS) { return HSD_state.BACKREF_INDEX_LSB; }
    this.windowBuffer.backrefIndexLsb(bits);
    this.outputCount = 0;
    const backrefBitCount = this.lookaheadSize2;
    return (backrefBitCount > 8) ? HSD_state.BACKREF_COUNT_MSB : HSD_state.BACKREF_COUNT_LSB;
  }

  private backrefCountMsb() {
    const backrefBitCount = this.lookaheadSize2;
    const bits = this.inputBuffer.getBits(backrefBitCount - 8);
    if (bits === HeatshrinkDecoderInputBuffer.NO_BITS) { return HSD_state.BACKREF_COUNT_MSB; }
    this.outputCount = bits << 8;
    return HSD_state.BACKREF_COUNT_LSB;
  }

  private backrefCountLsb() {
    const backrefBitCount = this.lookaheadSize2;
    const bits = this.inputBuffer.getBits(Math.min(backrefBitCount, 8));
    if (bits === HeatshrinkDecoderInputBuffer.NO_BITS) { return HSD_state.BACKREF_COUNT_LSB; }
    this.outputCount |= bits;
    this.outputCount++;
    return HSD_state.YIELD_BACKREF;
  }

  private yieldBackref() {
    let count = this.outputBuffer.remaining;
    if (count > 0) {
      if (this.outputCount < count) count = this.outputCount;

      for (let i = 0; i < count; i++) {
        const c = this.windowBuffer.yieldBackref();
        this.outputBuffer.pushByte(c);
      }
      this.outputCount -= count;
      if (this.outputCount == 0) { return HSD_state.TAG_BIT; }
    }
    return HSD_state.YIELD_BACKREF;
  }

  private finish() {
    switch (this._state) {
      case HSD_state.TAG_BIT:
        return this.inputBuffer.size == 0 ? HSD_finish_res.FINISH_DONE : HSD_finish_res.FINISH_MORE;

      /* If we want to finish with no input, but are in these states, it's
       * because the 0-bit padding to the last byte looks like a backref
       * marker bit followed by all 0s for index and count bits. */
      case HSD_state.BACKREF_INDEX_LSB:
      case HSD_state.BACKREF_INDEX_MSB:
      case HSD_state.BACKREF_COUNT_LSB:
      case HSD_state.BACKREF_COUNT_MSB:
        return this.inputBuffer.size == 0 ? HSD_finish_res.FINISH_DONE : HSD_finish_res.FINISH_MORE;

      /* If the output stream is padded with 0xFFs (possibly due to being in
       * flash memory), also explicitly check the input size rather than
       * uselessly returning MORE but yielding 0 bytes when polling. */
      case HSD_state.YIELD_LITERAL:
        return this.inputBuffer.size == 0 ? HSD_finish_res.FINISH_DONE : HSD_finish_res.FINISH_MORE;

      default:
        return HSD_finish_res.FINISH_MORE;
    }
  }

  private poll() {
    while (true) {
      const inState = this._state;
      switch (inState) {
        case HSD_state.TAG_BIT:
          this._state = this.tagBit();
          break;
        case HSD_state.YIELD_LITERAL:
          this._state = this.yieldLiteral();
          break;
        case HSD_state.BACKREF_INDEX_MSB:
          this._state = this.backrefIndexMsb();
          break;
        case HSD_state.BACKREF_INDEX_LSB:
          this._state = this.backrefIndexLsb();
          break;
        case HSD_state.BACKREF_COUNT_MSB:
          this._state = this.backrefCountMsb();
          break;
        case HSD_state.BACKREF_COUNT_LSB:
          this._state = this.backrefCountLsb();
          break;
        case HSD_state.YIELD_BACKREF:
          this._state = this.yieldBackref();
          break;
      }
      if (this._state === inState) {
        if (this.outputBuffer.remaining === 0) { return HSD_poll_res.POLL_MORE; }
        return HSD_poll_res.POLL_EMPTY;
      }
    }
  }

  /**
   * 
   * @param data The data to sink
   * @param skipCopy Don't copy the output buffer before yielding, but use the same memory as the internal buffer
   * @yields The output buffer when it's ready to be read
   * @returns True if the decoder expects to parse more data, false if it on a sane boundary.
   */
  *sinkRead(data: Uint8Array, skipCopy?: boolean) {
    let sunk = 0;
    do {
      if ((data.length - sunk) > 0) {
        sunk += this.inputBuffer.sink(data.subarray(sunk, data.length));
      }

      let pres: HSD_poll_res;
      do {
        pres = this.poll();
        if (this.outputBuffer.remaining === 0 || (this.outputBuffer.size > 0 && pres === HSD_poll_res.POLL_EMPTY && sunk >= data.length)) {
          if (skipCopy) {
            yield new Uint8Array(this.outputBuffer.buffer, this.outputBuffer.byteOffset, this.outputBuffer.size);
          } else {
            yield new Uint8Array(this.outputBuffer.subarray(0, this.outputBuffer.size));
          }
          this.outputBuffer.size = 0;
        }
      } while (pres == HSD_poll_res.POLL_MORE);

      if ((data.length - sunk) == 0 && this.outputBuffer.size == 0) {
        const fres = this.finish();
        if (fres == HSD_finish_res.FINISH_DONE) { return true; }
      }
    } while (sunk < data.length);

    return false;
  }
}
