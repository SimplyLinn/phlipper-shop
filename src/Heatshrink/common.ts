export const HEATSHRINK_MIN_WINDOW_BITS = 4;
export const HEATSHRINK_MAX_WINDOW_BITS = 15;

export const HEATSHRINK_MIN_LOOKAHEAD_BITS = 3;

export const HEATSHRINK_LITERAL_MARKER = 0x01;
export const HEATSHRINK_BACKREF_MARKER = 0x00;

export interface TypedArray {
  /**
   * The size in bytes of each element in the array.
   */
  readonly BYTES_PER_ELEMENT: number;

  /**
   * The ArrayBuffer instance referenced by the array.
   */
  readonly buffer: ArrayBufferLike;

  /**
   * The length in bytes of the array.
   */
  readonly byteLength: number;

  /**
   * The offset in bytes of the array.
   */
  readonly byteOffset: number;
}

export class HeatshrinkByteArray extends Uint8Array {
  reset() {
    this.fill(0);
  }
}

export function copyBuffer(dst: TypedArray, src: TypedArray, dstIndex = 0, srcIndex = 0, byteLength?: number) {
  const dstByteIndex = dst.BYTES_PER_ELEMENT * dstIndex;
  const dstArr = new Uint8Array(dst.buffer, dst.byteOffset + dstByteIndex, dst.byteLength - dstByteIndex);
  const srcByteIndex = src.BYTES_PER_ELEMENT * srcIndex;
  const srcArr = new Uint8Array(src.buffer, src.byteOffset + srcByteIndex, src.byteLength - srcByteIndex);

  dstArr.set(byteLength == null ? srcArr : srcArr.subarray(0, byteLength));
}

export class HeatshrinkWritableByteBuffer extends Uint8Array {
  public head = 0;
  public size = 0;

  public get remaining() {
    return this.length - this.size;
  }

  public copyFrom(source: Uint8Array, srcIndex: number, dstIndex: number, length?: number) {
    if (length == null) {
      length = Math.min(source.length - srcIndex, this.length - dstIndex);
    }
    for (let i = 0; i < length; i++) {
      this[dstIndex + i] = source[srcIndex + i];
    }
  }

  public copyTo(dst: Uint8Array, dstIndex: number, srcIndex: number, length?: number) {
    if (length == null) {
      length = Math.min(dst.length - dstIndex, this.size - dstIndex);
    }
    for (let i = 0; i < length; i++) {
      dst[dstIndex + i] = this[srcIndex + i];
    }
  }

  public pushByte(byte: number) {
    this[this.size++] = byte;
  }

  public reset() {
    this.head = 0;
    this.size = 0;
  }
}

export class HeatshrinkIOBuffer extends HeatshrinkByteArray {
  public head = 0;
  public size = 0;

  public get remaining() {
    return this.length - this.size;
  }

  public copyFrom(source: Uint8Array, srcIndex: number, dstIndex: number, length?: number) {
    if (length == null) {
      length = Math.min(source.length - srcIndex, this.length - dstIndex);
    }
    for (let i = 0; i < length; i++) {
      this[dstIndex + i] = source[srcIndex + i];
    }
  }

  public copyTo(dst: Uint8Array, dstIndex: number, srcIndex: number, length?: number) {
    if (length == null) {
      length = Math.min(dst.length - dstIndex, this.size - dstIndex);
    }
    for (let i = 0; i < length; i++) {
      dst[dstIndex + i] = this[srcIndex + i];
    }
  }

  public pushByte(byte: number) {
    this[this.size++] = byte;
  }

  public reset() {
    super.reset();
    this.head = 0;
    this.size = 0;
  }

  public subarray(...args: Parameters<Uint8Array['subarray']>): typeof this {
    return super.subarray(...args) as typeof this;
  }
}
