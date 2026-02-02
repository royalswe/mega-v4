import * as migration_20260201_153059 from './20260201_153059';
import * as migration_20260202_201746 from './20260202_201746';
import * as migration_20260202_213914 from './20260202_213914';

export const migrations = [
  {
    up: migration_20260201_153059.up,
    down: migration_20260201_153059.down,
    name: '20260201_153059',
  },
  {
    up: migration_20260202_201746.up,
    down: migration_20260202_201746.down,
    name: '20260202_201746',
  },
  {
    up: migration_20260202_213914.up,
    down: migration_20260202_213914.down,
    name: '20260202_213914'
  },
];
