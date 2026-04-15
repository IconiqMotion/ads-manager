import { useState, useEffect } from 'react';
import { useFilters } from '../context/FilterContext';
import { getOverview, getByIndustry, getTopAds } from '../api/dashboard.api';
import KPICard from '../components/charts/KPICard';
import TrendChart from '../components/charts/TrendChart';
import BenchmarkBars from '../components/charts/BenchmarkBars';
import AlertsPanel from '../components/AlertsPanel';
import InsightsFeed from '../components/InsightsFeed';
import Loader from '../components/common/Loader';
import { currency, percent, number } from '../utils/formatters';

export default function DashboardPage() {
  const { toQueryParams } = useFilters();
  const [overview, setOverview] = useState(null);
  const [industries, setIndustries] = useState([]);
  const [topAds, setTopAds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = toQueryParams();
        const [ov, ind, top] = await Promise.all([
          getOverview(params),
          getByIndustry(params),
          getTopAds({ ...params, sort_by: 'spend', limit: 10 })
        ]);
        setOverview(ov.data.data);
        setIndustries(ind.data.data);
        setTopAds(top.data.data);
      } catch (err) {
        console.error('Dashboard load failed:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toQueryParams]);

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard title="Total Spend" value={currency(overview?.total_spend)} color="blue" />
        <KPICard title="Impressions" value={number(overview?.total_impressions)} color="purple" />
        <KPICard title="Clicks" value={number(overview?.total_clicks)} color="green" />
        <KPICard title="Leads" value={number(overview?.total_leads)} color="orange" />
        <KPICard title="Avg CTR" value={percent(overview?.avg_ctr)} color="green" />
        <KPICard title="Avg CPC" value={currency(overview?.avg_cpc)} color="blue" />
        <KPICard title="Campaigns" value={overview?.active_campaigns || 0} color="purple" />
        <KPICard title="Accounts" value={overview?.active_accounts || 0} color="orange" />
      </div>

      {/* Industry Breakdown */}
      <div>
        <h3 className="mb-3 text-lg font-semibold text-gray-800">By Industry</h3>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Industry</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Clients</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Campaigns</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Spend</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Clicks</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {industries.map(ind => (
                <tr key={ind.industry_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{ind.industry_name}</td>
                  <td className="px-4 py-3 text-right">{ind.client_count}</td>
                  <td className="px-4 py-3 text-right">{ind.campaign_count}</td>
                  <td className="px-4 py-3 text-right">{currency(ind.total_spend)}</td>
                  <td className="px-4 py-3 text-right">{number(ind.total_clicks)}</td>
                  <td className="px-4 py-3 text-right">{percent(ind.avg_ctr)}</td>
                </tr>
              ))}
              {industries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No data yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trend Chart + Alerts side by side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart title="Performance Trends" />
        </div>
        <AlertsPanel />
      </div>

      {/* Insights Feed */}
      <InsightsFeed />

      {/* Benchmarks */}
      <BenchmarkBars />

      {/* Top Ads */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Top Ads by Spend</h3>
          <a href="/api/v1/export/csv?type=ads" target="_blank" rel="noreferrer"
            className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200">Export CSV</a>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {topAds.map(ad => (
            <div key={ad.id} className="rounded-lg bg-white p-3 shadow">
              {(ad.local_image || ad.image_url) && (
                <img
                  src={ad.local_image ? `/media/${ad.local_image}` : ad.image_url}
                  alt={ad.name}
                  className="mb-2 h-32 w-full rounded object-cover"
                />
              )}
              <p className="truncate text-xs font-medium text-gray-800">{ad.name}</p>
              <p className="text-xs text-gray-500">{ad.client_name}</p>
              <div className="mt-1 flex justify-between text-xs text-gray-600">
                <span>{currency(ad.total_spend)}</span>
                <span>CTR {percent(ad.avg_ctr)}</span>
              </div>
            </div>
          ))}
          {topAds.length === 0 && <p className="col-span-full text-center text-gray-400">No ads yet</p>}
        </div>
      </div>
    </div>
  );
}
