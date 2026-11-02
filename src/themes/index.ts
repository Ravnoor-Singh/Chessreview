/**
 * Theme registry — public entry point (Themes & Presets program).
 *
 * The registry is split into per-kind modules so consumers only bundle
 * what they render: the board imports `boards`, the settings store
 * imports the lightweight validators, the page-background layer
 * lazy-loads `backgrounds`, and the settings page imports everything
 * (including `presetTransfer`, the one Zod consumer). This barrel is
 * for tests and tooling.
 */
export * from './types';
export * from './boards';
export * from './pieces';
export * from './backgrounds';
export * from './sounds';
export * from './animations';
export * from './presets';
export * from './userPresets';
export * from './presetTransfer';
export * from './favorites';
