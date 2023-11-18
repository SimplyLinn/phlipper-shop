/** @typedef {{"0.1":{[key in keyof import("./v/0.1")]:import("./v/0.1")[key]},"0.2":{[key in keyof import("./v/0.2")]:import("./v/0.2")[key]},"0.3":{[key in keyof import("./v/0.3")]:import("./v/0.3")[key]},"0.4":{[key in keyof import("./v/0.4")]:import("./v/0.4")[key]},"0.5":{[key in keyof import("./v/0.5")]:import("./v/0.5")[key]},"0.6":{[key in keyof import("./v/0.6")]:import("./v/0.6")[key]},"0.7":{[key in keyof import("./v/0.7")]:import("./v/0.7")[key]},"0.8":{[key in keyof import("./v/0.8")]:import("./v/0.8")[key]},"0.9":{[key in keyof import("./v/0.9")]:import("./v/0.9")[key]},"0.10":{[key in keyof import("./v/0.10")]:import("./v/0.10")[key]},"0.11":{[key in keyof import("./v/0.11")]:import("./v/0.11")[key]},"0.12":{[key in keyof import("./v/0.12")]:import("./v/0.12")[key]},"0.13":{[key in keyof import("./v/0.13")]:import("./v/0.13")[key]},"0.14":{[key in keyof import("./v/0.14")]:import("./v/0.14")[key]},"0.15":{[key in keyof import("./v/0.15")]:import("./v/0.15")[key]},"0.16":{[key in keyof import("./v/0.16")]:import("./v/0.16")[key]},"0.17":{[key in keyof import("./v/0.17")]:import("./v/0.17")[key]},"0.18":{[key in keyof import("./v/0.18")]:import("./v/0.18")[key]},"0.19":{[key in keyof import("./v/0.19")]:import("./v/0.19")[key]},"0.20":{[key in keyof import("./v/0.20")]:import("./v/0.20")[key]},"0.21":{[key in keyof import("./v/0.21")]:import("./v/0.21")[key]}}} PROTOBUF_VERSION_MAP **/
export const PROTOBUF_VERSIONS = /** @type {const} */ ([
  '0.1',
  '0.2',
  '0.3',
  '0.4',
  '0.5',
  '0.6',
  '0.7',
  '0.8',
  '0.9',
  '0.10',
  '0.11',
  '0.12',
  '0.13',
  '0.14',
  '0.15',
  '0.16',
  '0.17',
  '0.18',
  '0.19',
  '0.20',
  '0.21',
]);
/** @typedef {typeof PROTOBUF_VERSIONS[number]} PROTOBUF_VERSION **/
/**
 * @overload
 * @param {"0.1"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.1"]>}
 **/
/**
 * @overload
 * @param {"0.2"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.2"]>}
 **/
/**
 * @overload
 * @param {"0.3"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.3"]>}
 **/
/**
 * @overload
 * @param {"0.4"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.4"]>}
 **/
/**
 * @overload
 * @param {"0.5"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.5"]>}
 **/
/**
 * @overload
 * @param {"0.6"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.6"]>}
 **/
/**
 * @overload
 * @param {"0.7"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.7"]>}
 **/
/**
 * @overload
 * @param {"0.8"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.8"]>}
 **/
/**
 * @overload
 * @param {"0.9"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.9"]>}
 **/
/**
 * @overload
 * @param {"0.10"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.10"]>}
 **/
/**
 * @overload
 * @param {"0.11"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.11"]>}
 **/
/**
 * @overload
 * @param {"0.12"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.12"]>}
 **/
/**
 * @overload
 * @param {"0.13"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.13"]>}
 **/
/**
 * @overload
 * @param {"0.14"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.14"]>}
 **/
/**
 * @overload
 * @param {"0.15"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.15"]>}
 **/
/**
 * @overload
 * @param {"0.16"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.16"]>}
 **/
/**
 * @overload
 * @param {"0.17"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.17"]>}
 **/
/**
 * @overload
 * @param {"0.18"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.18"]>}
 **/
/**
 * @overload
 * @param {"0.19"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.19"]>}
 **/
/**
 * @overload
 * @param {"0.20"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.20"]>}
 **/
/**
 * @overload
 * @param {"0.21"} version
 * @returns {Promise<PROTOBUF_VERSION_MAP["0.21"]>}
 **/
/**
 * @template {`${keyof PROTOBUF_VERSION_MAP}`} T
 * @overload
 * @param {T} version
 * @returns {Promise<PROTOBUF_VERSION_MAP[T]>}
 **/
/**
 * @template {`${keyof PROTOBUF_VERSION_MAP}`} T
 * @param {T} version
 * @returns {Promise<typeof PROTOBUF_VERSION_MAP[T]>}
 **/
export function loadProtobuf(version) {
  return import(
    /* webpackChunkName: "protobuf-version" */
    /* webpackMode: "lazy-once" */
    `./v/${version}/index.js`
  );
}
export const FIRST_VERSION = '0.1';
/** @typedef {typeof FIRST_VERSION} FIRST_VERSION **/
export const LATEST_VERSION = '0.21';
/** @typedef {typeof LATEST_VERSION} LATEST_VERSION **/
/**
 * @param {string} version
 * @returns {version is PROTOBUF_VERSION}
 **/
export function isValidVersion(version) {
  return PROTOBUF_VERSIONS.includes(version);
}
