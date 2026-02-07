import * as migration_20260206_214812 from './20260206_214812';
import * as migration_20260207_224524 from './20260207_224524';

export const migrations = [
  {
    up: migration_20260206_214812.up,
    down: migration_20260206_214812.down,
    name: '20260206_214812',
  },
  {
    up: migration_20260207_224524.up,
    down: migration_20260207_224524.down,
    name: '20260207_224524'
  },
];
