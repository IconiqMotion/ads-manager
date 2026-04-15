import { useState, useEffect } from 'react';
import { listInsights } from '../api/intelligence.api';
import { date } from '../utils/formatters';

const SEVERITY_COLORS = {
  info: 'border-blue-400 bg-blue-50',
  warning: 'border-yellow-400 bg-yellow-50',
  critical: 'border-red-400 bg-red-50'
};

const TYPE_LABELS = {
  top_mover: 'Top Mover',
  worst_performer: 'Needs Attention',
  anomaly: 'Anomaly',
  creative_winner: 'Winner',
  recommendation: 'Recommendation'
};

export default function InsightsFeed() {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await listInsights({ limit: 10 });
        setInsights(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return null;
  if (insights.length === 0) return null;

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <h3 className="mb-3 text-lg font-semibold text-gray-800">Insights</h3>
      <div className="space-y-2">
        {insights.map(ins => (
          <div key={ins.id} className={`rounded border-l-4 p-3 ${SEVERITY_COLORS[ins.severity] || SEVERITY_COLORS.info}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">{TYPE_LABELS[ins.type] || ins.type}</span>
              <span className="text-xs text-gray-400">{date(ins.created_at)}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-gray-800">{ins.title}</p>
            {ins.description && <p className="mt-0.5 text-xs text-gray-600">{ins.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
