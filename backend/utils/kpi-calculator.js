/**
 * Calculate derived KPIs from raw Meta insights data.
 */
function calculateKPIs(raw) {
  const impressions = parseInt(raw.impressions) || 0;
  const clicks = parseInt(raw.clicks) || 0;
  const spend = parseFloat(raw.spend) || 0;
  const reach = parseInt(raw.reach) || 0;

  // Extract actions
  let leads = 0, purchases = 0, conversions = 0;
  if (Array.isArray(raw.actions)) {
    for (const action of raw.actions) {
      if (action.action_type === 'lead') leads += parseInt(action.value) || 0;
      if (action.action_type === 'purchase' || action.action_type === 'offsite_conversion.fb_pixel_purchase') {
        purchases += parseInt(action.value) || 0;
      }
      conversions += parseInt(action.value) || 0;
    }
  }

  // Extract cost per action
  let costPerResult = null;
  if (Array.isArray(raw.cost_per_action_type) && raw.cost_per_action_type.length > 0) {
    costPerResult = parseFloat(raw.cost_per_action_type[0].value) || null;
  }

  return {
    impressions,
    reach,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    spend,
    leads,
    purchases,
    roas: spend > 0 && purchases > 0 ? (purchases * 100) / spend : 0, // simplified
    frequency: reach > 0 ? impressions / reach : 0,
    conversions,
    cost_per_result: costPerResult,
    actions: raw.actions ? JSON.stringify(raw.actions) : null
  };
}

module.exports = { calculateKPIs };
