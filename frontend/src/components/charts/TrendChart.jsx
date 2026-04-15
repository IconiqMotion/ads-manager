import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getTrends } from '../../api/dashboard.api';
import { useFilters } from '../../context/FilterContext';
import { dateShort } from '../../utils/formatters';

const METRICS = [
  { value: 'spend', label: 'Spend', color: '#3b82f6' },
  { value: 'clicks', label: 'Clicks', color: '#10b981' },
  { value: 'impressions', label: 'Impressions', color: '#8b5cf6' },
  { value: 'leads', label: 'Leads', color: '#f59e0b' },
  { value: 'ctr', label: 'CTR %', color: '#ef4444' },
  { value: 'cpc', label: 'CPC', color: '#06b6d4' },
];

export default function TrendChart({ campaignId, adAccountId, title = 'Trends' }) {
  const { filters } = useFilters();
  const [metric, setMetric] = useState('spend');
  const [granularity, setGranularity] = useState('day');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = {
          metric, granularity,
          date_from: filters.date_from,
          date_to: filters.date_to
        };
        if (campaignId) params.campaign_id = campaignId;
        if (adAccountId) params.ad_account_id = adAccountId;

        const res = await getTrends(params);
        setData((res.data.data || []).map(r => ({
          ...r,
          period: dateShort(r.period),
          value: parseFloat(r[metric]) || 0
        })));
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [metric, granularity, filters.date_from, filters.date_to, campaignId, adAccountId]);

  const currentMetric = METRICS.find(m => m.value === metric) || METRICS[0];

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <div className="flex gap-2">
          <select value={metric} onChange={e => setMetric(e.target.value)}
            className="rounded border px-2 py-1 text-xs">
            {METRICS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select value={granularity} onChange={e => setGranularity(e.target.value)}
            className="rounded border px-2 py-1 text-xs">
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-gray-400">Loading...</div>
      ) : data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey={metric} stroke={currentMetric.color} name={currentMetric.label} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-64 items-center justify-center text-gray-400">No trend data</div>
      )}
    </div>
  );
}
