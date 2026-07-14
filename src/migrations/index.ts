import * as migration_20260210_184006 from './20260210_184006';
import * as migration_20260527_194848_community_engine_feature from './20260527_194848_community_engine_feature';
import * as migration_20260528_205202___name from './20260528_205202___name';
import * as migration_20260530_205839 from './20260530_205839';
import * as migration_20260530_214358_media_uploaded_by from './20260530_214358_media_uploaded_by';
import * as migration_20260609_205953 from './20260609_205953';
import * as migration_20260713_232405_add_private_messages from './20260713_232405_add_private_messages';

export const migrations = [
  {
    up: migration_20260210_184006.up,
    down: migration_20260210_184006.down,
    name: '20260210_184006',
  },
  {
    up: migration_20260527_194848_community_engine_feature.up,
    down: migration_20260527_194848_community_engine_feature.down,
    name: '20260527_194848_community_engine_feature',
  },
  {
    up: migration_20260528_205202___name.up,
    down: migration_20260528_205202___name.down,
    name: '20260528_205202___name',
  },
  {
    up: migration_20260530_205839.up,
    down: migration_20260530_205839.down,
    name: '20260530_205839',
  },
  {
    up: migration_20260530_214358_media_uploaded_by.up,
    down: migration_20260530_214358_media_uploaded_by.down,
    name: '20260530_214358_media_uploaded_by',
  },
  {
    up: migration_20260609_205953.up,
    down: migration_20260609_205953.down,
    name: '20260609_205953',
  },
  {
    up: migration_20260713_232405_add_private_messages.up,
    down: migration_20260713_232405_add_private_messages.down,
    name: '20260713_232405_add_private_messages'
  },
];
