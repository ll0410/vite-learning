import { untouchedMarker } from './untouched'

const migratedMarker = '__LEGACY_ROLLUP_MESSAGE__'

Object.assign(globalThis, {
  __legacyRollupMigrationFixture: { migratedMarker, untouchedMarker },
})
