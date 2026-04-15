import { useState, useEffect } from 'react';
import { getBudgetRecommendations } from '../api/intelligence.api';
import { currency, percent } from '../utils/formatters';

const ACTION_COLORS = {
  increase: 'bg-green-100 text-green-800',
  decrease: 'bg-red-100 text-red-800',
  review: 'bg-yellow-100 text-yellow-800',
  maintain: 'bg-gray-100 text-gray-600'
};

export default function RecommendationsPanel({ clientId }) {
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) return;
    async function load() {
      try {
        const res = await getBudgetRecommendations(clientId);
        setRecs(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [clientId]);

  if (loading || recs.length === 0) return null;

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <h3 className="mb-3 text-lg font-semibold text-gray-800">Budget Recommendations</h3>
      <div className="space-y-2">
        {recs.map(r => (
          <div key={r.id} className="flex items-center justify-between rounded border p-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">{r.name}</p>
              <p className="text-xs text-gray-500">
                Spend: {currency(r.total_spend)} &middot; CTR: {percent(r.ctr)} &middot; CPC: {currency(r.cpc)}
                {r.total_leads > 0 && ` · CPL: ${currency(r.cpl)}`}
              </p>
              {r.reason && <p className="mt-1 text-xs text-gray-600">{r.reason}</p>}
            </div>
            <span className={`ml-3 rounded-full px-3 py-1 text-xs font-medium ${ACTION_COLORS[r.action] || ACTION_COLORS.maintain}`}>
              {r.action.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
