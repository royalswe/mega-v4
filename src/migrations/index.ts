import * as migration_20260205_214348 from './20260205_214348';
import * as migration_20260206_212527 from './20260206_212527';

export const migrations = [
  {
    up: migration_20260205_214348.up,
    down: migration_20260205_214348.down,
    name: '20260205_214348',
  },
  {
    up: migration_20260206_212527.up,
    down: migration_20260206_212527.down,
    name: '20260206_212527'
  },
];
