import * as migration_20260206_214812 from './20260206_214812';
import * as migration_20260207_224524 from './20260207_224524';
import * as migration_20260210_183139 from './20260210_183139';

export const migrations = [
  {
    up: migration_20260206_214812.up,
    down: migration_20260206_214812.down,
    name: '20260206_214812',
  },
  {
    up: migration_20260207_224524.up,
    down: migration_20260207_224524.down,
    name: '20260207_224524',
  },
  {
    up: migration_20260210_183139.up,
    down: migration_20260210_183139.down,
    name: '20260210_183139'
  },
];
