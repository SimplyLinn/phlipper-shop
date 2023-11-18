import { FlipperRpcSerialPort } from '../../RPC/Serial/FlipperRpcSerialPort';
import { FlipperRpcApi } from '@/flipper/RPC/FlipperRpcApi';

const serialFilters = [{ usbVendorId: 0x0483, usbProductId: 0x5740 }];

navigator.serial
  .getPorts({ filters: serialFilters })
  .then((ports) => FlipperRpcSerialPort.resolve(ports[0]))
  .then((port) =>
    FlipperRpcApi.create(port, {
      minVersion: '0.15',
      requireExactMatch: true,
    }),
  )
  .then(console.log, console.error);
