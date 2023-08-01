import { HEATSHRINK_BACKREF_MARKER, HEATSHRINK_LITERAL_MARKER, HEATSHRINK_MAX_WINDOW_BITS, HEATSHRINK_MIN_LOOKAHEAD_BITS, HEATSHRINK_MIN_WINDOW_BITS, HeatshrinkByteArray, HeatshrinkIOBuffer } from "./common.js";

enum HSE_state {
  NOT_FULL,              /* input buffer not full enough */
  FILLED,                /* buffer is full */
  SEARCH,                /* searching for patterns */
  YIELD_TAG_BIT,         /* yield tag bit */
  YIELD_LITERAL,         /* emit literal byte */
  YIELD_BR_INDEX,        /* yielding backref index */
  YIELD_BR_LENGTH,       /* yielding backref length */
  SAVE_BACKLOG,          /* copying buffer to backlog */
  FLUSH_BITS,            /* flush bit buffer */
  DONE,                  /* done */
};

enum HSE_poll_res {
  POLL_EMPTY /* input exhausted */,
  POLL_MORE /* more data remaining, call again w/ fresh output buffer */,
}

enum HSE_finish_res {
  FINISH_DONE /* input exhausted */,
  FINISH_MORE /* more data remaining, call again w/ fresh output buffer */,
}

const FLAG_IS_FINISHING = 0x01;

const MATCH_NOT_FOUND = 0xffff;

class HeatshrinkEncoderInputBuffer extends HeatshrinkIOBuffer {
  static readonly NO_BITS = Symbol('NO BITS')
  private currentByte = 0;
  private bitIndex = 0;

  getBits(count: number) {
    let acc = 0;
    let i = 0;
    if (count > 15) {
      return HeatshrinkEncoderInputBuffer.NO_BITS;
    }
    if (this.size === 0 && this.bitIndex < (1 << (count - 1))) {
      return HeatshrinkEncoderInputBuffer.NO_BITS;
    }

    for (i = 0; i < count; i++) {
      if (this.bitIndex === 0x00) {
        if (this.size === 0) {
          return HeatshrinkEncoderInputBuffer.NO_BITS;
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

class HeatshrinkEncoderOutputBuffer extends HeatshrinkIOBuffer {
  private currentByte = 0;
  private bitIndex = 0x80;

  pushBits(count: number, bits: number) {
    /* If adding a whole byte and at the start of a new output byte,
     * just push it through whole and skip the bit IO loop. */
    if (count == 8 && this.bitIndex == 0x80) {
      this[this.size++] = bits;
    } else {
      for (let i = count - 1; i >= 0; i--) {
        const bit = Boolean(bits & (1 << i));
        if (bit) { this.currentByte |= this.bitIndex; }
        this.bitIndex >>= 1;
        if (this.bitIndex == 0x00) {
          this.bitIndex = 0x80;
          this[this.size++] = this.currentByte;
          this.currentByte = 0x00;
        }
      }
    }
  }

  public hasPartial() {
    return this.bitIndex !== 0x08;
  }

  flushBits() {
    this[this.size++] = this.currentByte;  
  }

  reset() {
    super.reset();
    this.currentByte = 0;
    this.bitIndex = 0x80;
  }
}

interface HeatshrinkEncoderConfig {
  /** How big the output buffer should be? */
  outputBufferSize?: number;
  /** How many bits to support */
  windowSize2?: number;
  /** How many bits to look ahead */
  lookaheadSize2?: number;
}

export default class HeatshrinkEncoder {


  private _state: HSE_state = HSE_state.NOT_FULL;
  private matchScanIndex = 0;
  private matchPos = MATCH_NOT_FOUND;
  private matchLength = 0;
  private flags = 0;
  private outgoingBits = 0x0000;
  private outgoingBitCount = 0;

  private index: Int16Array;
  private bytes: Uint8Array;
  private prevWindowBytes: Uint8Array;
  private inputBuffer: HeatshrinkEncoderInputBuffer;
  private outputBuffer: HeatshrinkEncoderOutputBuffer;

  public readonly windowSize2: number;
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
    windowSize2 = 8,
    lookaheadSize2 = 4,
  }: HeatshrinkEncoderConfig
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

    this.bytes = new Uint8Array(windowSize * 2 + outputBufferSize);
    const buffer = this.bytes.buffer;
    const byteOffset = this.bytes.byteOffset;
    this.prevWindowBytes = new Uint8Array(buffer, byteOffset, windowSize);
    this.inputBuffer = new HeatshrinkEncoderInputBuffer(buffer, byteOffset + windowSize, windowSize);
    this.index = new Int16Array(this.prevWindowBytes.length + this.inputBuffer.length);
    this.outputBuffer = new HeatshrinkEncoderOutputBuffer(buffer, byteOffset + windowSize * 2, outputBufferSize);

    this.windowSize2 = windowSize2;
    this.lookaheadSize2 = lookaheadSize2;
    this.reset();
  }

  public isFinishing() {
    return Boolean(this.flags & FLAG_IS_FINISHING)
  }

  private reset() {
    this._state = HSE_state.NOT_FULL;
    this.matchScanIndex = 0;
    this.matchPos = MATCH_NOT_FOUND;
    this.matchLength = 0;
    this.flags = 0;
    this.outgoingBits = 0x0000;
    this.outgoingBitCount = 0;
    this.prevWindowBytes.fill(0);
    this.inputBuffer.reset();
    this.outputBuffer.reset();
  }

  private findLongestMatch(start: number, end: number, maxLen: number) {
    let matchMaxLen = 0;
    let matchIndex = MATCH_NOT_FOUND;

    const needlepoint = this.bytes.subarray(end);
    let pos = this.index[end];
    while (pos - start >= 0) {
      const pospoint = this.bytes.subarray(pos);
      let len;
      /* Only check matches that will potentially beat the current maxlen.
       * This is redundant with the index if match_maxlen is 0, but the
       * added branch overhead to check if it == 0 seems to be worse. */
      if (pospoint[matchMaxLen] !== needlepoint[matchMaxLen]) {
        pos = this.index[pos];
        continue;
      }

      for (len = 1; len < maxLen; len++) {
        if (pospoint[len] != needlepoint[len]) break;
      }

      if (len > matchMaxLen) {
        matchMaxLen = len;
        matchIndex = pos;
        if (len == maxLen) { break; } /* won't find better */
      }
      pos = this.index[pos];
    }

    const breakEvenPoint =
      (1 + this.windowSize2 + this.lookaheadSize2) * 8;
    if (matchMaxLen > breakEvenPoint) {
      return [end - matchIndex, matchMaxLen];
    }
    return [MATCH_NOT_FOUND, 0];
  }

  private pushOutgoingBits() {
    let count = 0;
    let bits = 0;
    let hasMore;
    if (this.outgoingBitCount > 8) {
      count = 8;
      bits = this.outgoingBits >> (this.outgoingBitCount - 8);
      hasMore = true;
    } else {
      count = this.outgoingBitCount;
      bits = this.outgoingBits;
      hasMore = false;
    }

    if (count > 0) {
      this.outputBuffer.pushBits(count, bits);
      this.outgoingBitCount -= count;
    }
    return hasMore;
  }

  private filled() {
    const last = new Int16Array(256);
    last.fill(-1);
    const end = this.inputBuffer.byteOffset + this.inputBuffer.size * this.inputBuffer.BYTES_PER_ELEMENT;
    for (let i = 0; i < end; i++) {
      const v = this.bytes[i];
      const lv = last[v];
      this.index[i] = lv;
      last[v] = i;
    }
    return HSE_state.SEARCH;
  }

  private stepSearch() {
    const windowLength = this.inputBuffer.length;
    const lookaheadSize = 1 << this.lookaheadSize2;

    const fin = this.isFinishing();
    if (this.matchScanIndex > this.inputBuffer.size - (fin ? 1 : lookaheadSize)) {
      return fin ? HSE_state.FLUSH_BITS : HSE_state.SAVE_BACKLOG;
    }

    const inputOffset = this.inputBuffer.byteOffset;
    const end = inputOffset + this.matchScanIndex;
    const start = end - windowLength;

    let maxPossible = lookaheadSize;
    if (this.inputBuffer.size - this.matchScanIndex < lookaheadSize) {
      maxPossible = this.inputBuffer.size - this.matchScanIndex;
    }
    let matchPos;
    [matchPos, this.matchLength] = this.findLongestMatch(start, end, maxPossible);

    if (matchPos == MATCH_NOT_FOUND) {
      this.matchScanIndex++;
    } else {
      this.matchPos = matchPos;
    }
    return HSE_state.YIELD_TAG_BIT;
  }

  yieldTagBit() {
    if (this.outputBuffer.remaining > 0) {
      if (this.matchLength === 0) {
        this.outputBuffer.pushBits(1, HEATSHRINK_LITERAL_MARKER);
        return HSE_state.YIELD_LITERAL;
      } else {
        this.outputBuffer.pushBits(1, HEATSHRINK_BACKREF_MARKER);
        this.outgoingBits = this.matchPos - 1;
        this.outgoingBitCount = this.windowSize2;
        return HSE_state.
          YIELD_BR_INDEX;
      }
    } else {
      return HSE_state.YIELD_TAG_BIT; /* output is full, continue */
    }
  }

  private yieldLiteral() {
    if (this.outputBuffer.remaining > 0) {
      const byte = this.inputBuffer[this.matchScanIndex - 1];
      this.outputBuffer.pushBits(8, byte);
      return HSE_state.SEARCH;
    } else {
      return HSE_state.YIELD_LITERAL;
    }
  }

  private yieldBackrefIndex() {
    while (this.outputBuffer.remaining > 0) {
      if (!this.pushOutgoingBits()) {
        this.outgoingBits = this.matchLength - 1;
        this.outgoingBitCount = this.lookaheadSize2;
        return HSE_state.YIELD_BR_LENGTH; /* done */
      }
    }
    return HSE_state.YIELD_BR_INDEX; /* continue */
  }

  private yieldBackrefLength() {
    while (this.outputBuffer.remaining > 0) {
      if (!this.pushOutgoingBits()) {
        this.matchScanIndex += this.matchLength;
        this.matchLength = 0;
        return HSE_state.SEARCH;
      }
    }
    return HSE_state.YIELD_BR_LENGTH;
  }

  private saveBacklog() {
    /* Copy processed data to beginning of buffer, so it can be
     * used for future matches. Don't bother checking whether the
     * input is less than the maximum size, because if it isn't,
     * we're done anyway. */
    const remaining = this.inputBuffer.length - this.matchScanIndex; // unprocessed bytes

    this.bytes.copyWithin(0, this.inputBuffer.length - remaining);
        
    this.matchScanIndex = 0;
    this.inputBuffer.size -= this.inputBuffer.length - remaining;
    return HSE_state.NOT_FULL;
  }

  private flushBitBuffer() {
    if (!this.outputBuffer.hasPartial()) {
      return HSE_state.DONE;
    } else if (this.outputBuffer.remaining > 0) {
        this.outputBuffer.flushBits();
        return HSE_state.DONE;
    } else {
        return HSE_state.FLUSH_BITS;
    }
  }

  private finish() {
    this.flags |= FLAG_IS_FINISHING;
    if (this._state === HSE_state.NOT_FULL) { this._state = HSE_state.FILLED; }
    return this._state === HSE_state.DONE ? HSE_finish_res.FINISH_DONE : HSE_finish_res.FINISH_MORE;
  }

  private poll() {
    while (true) {
      const inState = this._state;
      switch (inState) {
        case HSE_state.NOT_FULL:
          return HSE_poll_res.POLL_EMPTY
        case HSE_state.FILLED:
          this._state = this.filled();
          break;
        case HSE_state.SEARCH:
          this._state = this.stepSearch();
          break;
        case HSE_state.YIELD_TAG_BIT:
          this._state = this.yieldTagBit();
          break;
        case HSE_state.YIELD_LITERAL:
          this._state = this.yieldLiteral();
          break;
        case HSE_state.YIELD_BR_INDEX:
          this._state = this.yieldBackrefIndex();
          break;
        case HSE_state.YIELD_BR_LENGTH:
          this._state = this.yieldBackrefLength();
          break;
        case HSE_state.SAVE_BACKLOG:
          this._state = this.saveBacklog();
          break;
        case HSE_state.FLUSH_BITS:
          this._state = this.flushBitBuffer();
          break;
        case HSE_state.DONE:
          return HSE_poll_res.POLL_EMPTY;
        default:
          throw new Error(`Invalid state: ${inState}`)
      }
      if (this._state === inState) {
        if (this.outputBuffer.remaining === 0) { return HSE_poll_res.POLL_MORE; }
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
    let pres: HSE_poll_res | undefined;
    let fres: HSE_finish_res | undefined;
    do {
      if ((data.length - sunk) > 0 && this._state === HSE_state.NOT_FULL) {
        sunk += this.inputBuffer.sink(data.subarray(sunk, data.length));
        if (this.inputBuffer.remaining === 0) {
          this._state = HSE_state.FILLED;
        }
      }

      do {
        pres = this.poll();
        if (this.outputBuffer.remaining === 0 || (this.outputBuffer.size > 0 && pres === HSE_poll_res.POLL_EMPTY && sunk >= data.length)) {
          if (skipCopy) {
            yield new Uint8Array(this.outputBuffer.buffer, this.outputBuffer.byteOffset, this.outputBuffer.size);
          } else {
            yield new Uint8Array(this.outputBuffer.subarray(0, this.outputBuffer.size));
          }
          this.outputBuffer.size = 0;
        }
      } while (pres === HSE_poll_res.POLL_MORE);

      if ((data.length - sunk) === 0 && this.outputBuffer.size === 0) {
        fres = this.finish();
        if (fres == HSE_finish_res.FINISH_DONE) { return true; }
      }
    } while (pres !== HSE_poll_res.POLL_EMPTY || fres == null);

    return false;
  }
}
