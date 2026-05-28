import * as migration_20260210_184006 from './20260210_184006'
import * as migration_20260527_194848_community_engine_feature from './20260527_194848_community_engine_feature'

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
]
