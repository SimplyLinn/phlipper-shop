import { FlipperRpcSerialPort } from '../../RPC/FlipperRpcSerialPort';
import { instantiate } from '@/flipper/RPC/Commands';

const serialFilters = [{ usbVendorId: 0x0483, usbProductId: 0x5740 }];

navigator.serial
  .getPorts({ filters: serialFilters })
  .then((ports) => FlipperRpcSerialPort.resolve(ports[0]))
  .then((port) =>
    instantiate(port, {
      minVersion: '0.15',
      requireExactMatch: true,
    }),
  )
  .then(console.log, console.error);
