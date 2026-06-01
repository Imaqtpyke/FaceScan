/** Match tiers applied to the top Teachable Machine class (0–1 scale). */
export const CONFIDENCE_THRESHOLDS = {
  /** Successful match (State A) */
  HIGH: 0.6,
  /** Minimum % to treat as a person match at all; below = no detection (State C) */
  LOW: 0.4,
};

export const THRESHOLD_LABELS = {
  highPercent: Math.round(CONFIDENCE_THRESHOLDS.HIGH * 100),
  lowPercent: Math.round(CONFIDENCE_THRESHOLDS.LOW * 100),
};
