function isErrorObject(t: any) {
  if (typeof t !== 'object' || t === null) return false;
  let descriptor;
  let target = t;
  do {
    descriptor = Object.getOwnPropertyDescriptor(target, Symbol.toStringTag);
    if (descriptor) {
      if (
        Object.hasOwn(descriptor, 'value') &&
        typeof descriptor.value !== 'string'
      ) {
        // The current value of the toStringTag property is not a string.
        // it will already ensure the default tag is used.
        return Object.prototype.toString.call(t) === '[object Error]';
      }
      if (descriptor.configurable) break;
      if (descriptor.writable) break;
      // We cannot do anything to securely check if this is a valid error object.
      return undefined;
    }
    if (!descriptor && Object.isExtensible(target)) break;
  } while ((target = Object.getPrototypeOf(target)) != null);
  if (target) {
    if (descriptor == null || descriptor.configurable) {
      try {
        Object.defineProperty(target, Symbol.toStringTag, {
          value: undefined,
          writable: false,
          enumerable: false,
          configurable: true,
        });
        return Object.prototype.toString.call(t) === '[object Error]';
      } finally {
        if (descriptor == null) {
          delete target[Symbol.toStringTag];
        } else {
          Object.defineProperty(target, Symbol.toStringTag, descriptor);
        }
      }
    }
    const oldVal = target[Symbol.toStringTag];
    try {
      target[Symbol.toStringTag] = undefined;
      return Object.prototype.toString.call(t) === '[object Error]';
    } finally {
      target[Symbol.toStringTag] = oldVal;
    }
  }
  // We have walked the prototype chain and been unable to
  // find a configurable toStringTag property.
  // however, the default toStringTag-value will
  // be used regardless!
  return Object.prototype.toString.call(t) === '[object Error]';
}
function isBooleanObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    Boolean.prototype.valueOf.call(t);
    return true;
  } catch (e) {
    return false;
  }
}
function isDateObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    Date.prototype.valueOf.call(t);
    return true;
  } catch (e) {
    return false;
  }
}
function isBigIntObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    BigInt.prototype.valueOf.call(t);
    return true;
  } catch (e) {
    return false;
  }
}
function isNumberObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    Number.prototype.valueOf.call(t);
    return true;
  } catch (e) {
    return false;
  }
}
function isStringObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    String.prototype.valueOf.call(t);
    return true;
  } catch (e) {
    return false;
  }
}
function isRegExpObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    Reflect.get(RegExp.prototype, 'source', t);
    return true;
  } catch {
    return false;
  }
}
function isArrayObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  return Array.isArray(t);
}
const TypedArrayProto = Object.getPrototypeOf(Uint8ClampedArray.prototype);

function getTypedArrayName(t: unknown): string | undefined {
  return Reflect.get(TypedArrayProto, Symbol.toStringTag, t);
}
function isTypedArrayObject(t: unknown) {
  return getTypedArrayName(t) != null;
}

function isInt8ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'Int8Array';
}
function isUint8ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'Uint8Array';
}
function isUint8CLampedArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'Uint8ClampedArray';
}
function isInt16ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'Int16Array';
}
function isUint16ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'Uint16Array';
}
function isInt32ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'Int32Array';
}
function isUint32ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'Uint32Array';
}
function isBigInt64ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'BigInt64Array';
}
function isBigUint64ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'BigUint64Array';
}
function isFloat32ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'Float32Array';
}
function isFloat64ArrayObject(t: unknown) {
  return getTypedArrayName(t) === 'Float64Array';
}
function isMapObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    Map.prototype.has.call(t, 'any');
    return true;
  } catch {
    return false;
  }
}
function isSetObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    Set.prototype.has.call(t, 'any');
    return true;
  } catch {
    return false;
  }
}
function isWeakMapObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    WeakMap.prototype.has.call(t, Object.prototype);
    return true;
  } catch {
    return false;
  }
}
function isWeakSetObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    WeakSet.prototype.has.call(t, Object.prototype);
    return true;
  } catch {
    return false;
  }
}
function isArrayBufferObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    Reflect.get(ArrayBuffer.prototype, 'byteLength', t);
    return true;
  } catch {
    return false;
  }
}
function isSharedArrayBufferObject(t: unknown) {
  if (typeof SharedArrayBuffer === 'undefined') return false;
  if (typeof t !== 'object' || t === null) return false;
  try {
    Reflect.get(SharedArrayBuffer.prototype, 'growable', t);
    return true;
  } catch {
    return false;
  }
}
function isDataViewObject(t: unknown) {
  if (typeof t !== 'object' || t === null) return false;
  try {
    Reflect.get(DataView.prototype, 'buffer', t);
    return true;
  } catch {
    return false;
  }
}
function isWeakRefObject(t: unknown) {
  if (typeof WeakRef === 'undefined') return false;
  if (typeof t !== 'object' || t === null) return false;
  try {
    WeakRef.prototype.deref.call(t);
    return true;
  } catch {
    return false;
  }
}
function isFinalizationRegistryObject(t: unknown) {
  if (typeof FinalizationRegistry === 'undefined') return false;
  if (typeof t !== 'object' || t === null) return false;
  try {
    FinalizationRegistry.prototype.unregister.call(t, Object.create(null));
    return true;
  } catch {
    return false;
  }
}
