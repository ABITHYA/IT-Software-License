export const RISK_FACTORS = [
  'data_sensitivity',
  'access_privilege',
  'business_criticality',
  'financial_impact',
  'external_access',
];

const RANK = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Each factor is rated 1 (low) to 4 (very high). Total 5-20:
 *   5-8 low | 9-12 medium | 13-16 high | 17-20 critical
 * Escalation rule: top-rated privilege AND business criticality => at least "high"
 * (e.g. AWS Admin Console).
 * Returns null unless all five factors are valid.
 */
export function calculateRisk(factors) {
  const values = RISK_FACTORS.map((k) => Number(factors?.[k]));
  if (values.some((v) => !Number.isInteger(v) || v < 1 || v > 4)) return null;

  const score = values.reduce((a, b) => a + b, 0);
  let level = score <= 8 ? 'low' : score <= 12 ? 'medium' : score <= 16 ? 'high' : 'critical';

  if (
    Number(factors.access_privilege) === 4 &&
    Number(factors.business_criticality) === 4 &&
    RANK[level] < RANK.high
  ) {
    level = 'high';
  }
  return { score, level };
}

export const pickFactors = (obj = {}) =>
  Object.fromEntries(RISK_FACTORS.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
