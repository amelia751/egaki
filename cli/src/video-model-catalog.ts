// Re-exports from the unified model catalog.
// video-model-catalog.ts used to be a separate file. All video model data now
// lives in model-catalog.ts alongside image models. This file exists only so
// existing imports (gateway/src/plans.ts, etc.) keep working without changes.
export {
  VIDEO_CATALOG,
  findVideoModel,
  type VideoModelEntry,
  type VideoModelFeatures,
  type VideoModelCost,
  type PerVideoSecondCost,
  type UnknownCost as UnknownVideoCost,
  type VideoDurationPricingTier,
} from './model-catalog.js'
