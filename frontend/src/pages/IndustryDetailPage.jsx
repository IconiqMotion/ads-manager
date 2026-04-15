import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { list as listClients } from '../api/clients.api';
import { list as listCampaigns } from '../api/campaigns.api';
import { useFilters } from '../context/FilterContext';
import TrendChart from '../components/charts/TrendChart';
import Loader from '../components/common/Loader';
import Badge from '../components/common/Badge';
import KPICard from '../components/charts/KPICard';
import { currency, percent, number } from '../utils/formatters';
import api from '../api/client';

export default function IndustryDetailPage() {
  const { id } = useParams();
  const { filters } = useFilters();
  const [industry, setIndustry] = useState(null);
  const [clients, setClients] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [benchmarks, setBenchmarks] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        // Get industry info + clients
        const [indRes, clRes] = await Promise.all([
          api.get('/industries'),
          listClients({ industry_id: id, limit: 200 })
        ]);

        const ind = indRes.data.data.find(i => String(i.id) === String(id));
        setIndustry(ind);
        const clientList = clRes.data.data;
        setClients(clientList);

        // Fetch campaigns for each client in this industry
        const allCampaigns = [];
        for (const client of clientList) {
          try {
            const campRes = await listCampaigns({ client_id: client.id, limit: 50 });
            allCampaigns.push(...campRes.data.data);
          } catch { /* skip */ }
        }
        setCampaigns(allCampaigns);

        // Fetch benchmarks
        try {
          const benchRes = await api.get('/dashboard/benchmarks', {
            params: { industry_id: id, date_from: filters.date_from, date_to: filters.date_to }
          });
          setBenchmarks(benchRes.data.data);
        } catch { /* skip */ }

      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, filters.date_from, filters.date_to]);

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">{industry?.name || 'Industry'}</h2>

      {/* KPIs from benchmarks */}
      {benchmarks?.overall && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KPICard title="Clients" value={clients.length} color="blue" />
          <KPICard title="Campaigns" value={campaigns.length} color="purple" />
          <KPICard title="Total Spend" value={currency(benchmarks.overall.total_spend)} subtitle="In selected date range" color="green" />
          <KPICard title="Avg CTR" value={percent(benchmarks.overall.avg_ctr)} subtitle="Click-through rate" color="orange" />
          <KPICard title="Avg CPC" value={currency(benchmarks.overall.avg_cpc)} subtitle="Cost per click" color="blue" />
          <KPICard title="Avg CPM" value={currency(benchmarks.overall.avg_cpm)} subtitle="Cost per 1000 impressions" color="purple" />
          <KPICard title="Total Clicks" value={number(benchmarks.overall.total_clicks)} color="green" />
          <KPICard title="Total Leads" value={number(benchmarks.overall.total_leads)} color="orange" />
        </div>
      )}

      {/* Industry Comparison */}
      {benchmarks?.by_industry?.length > 1 && (
        <div className="rounded-lg bg-white p-4 shadow">
          <h3 className="mb-3 text-lg font-semibold text-gray-800">How {industry?.name} compares to other industries</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Industry</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Avg CTR</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Avg CPC</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Avg CPM</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {benchmarks.by_industry.map(bi => (
                  <tr key={bi.industry_id} className={`hover:bg-gray-50 ${String(bi.industry_id) === String(id) ? 'bg-blue-50 font-medium' : ''}`}>
                    <td className="px-4 py-2">{bi.industry_name} {String(bi.industry_id) === String(id) ? '(this)' : ''}</td>
                    <td className="px-4 py-2 text-right">{percent(bi.avg_ctr)}</td>
                    <td className="px-4 py-2 text-right">{currency(bi.avg_cpc)}</td>
                    <td className="px-4 py-2 text-right">{currency(bi.avg_cpm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Clients */}
      <div>
        <h3 className="mb-2 text-lg font-semibold">Clients ({clients.length})</h3>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Brand</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Manager</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><Link to={`/clients/${c.id}`} className="text-blue-600 hover:underline">{c.client_name}</Link></td>
                  <td className="px-4 py-3 text-gray-500">{c.brand_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.account_manager || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.contact_phone || '—'}</td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No clients in this industry</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Campaigns */}
      <div>
        <h3 className="mb-2 text-lg font-semibold">Campaigns ({campaigns.length})</h3>
        <div className="overflow-x-auto rounded-lg bg-white shadow">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Campaign</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Objective</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium"><Link to={`/campaigns/${c.id}`} className="text-blue-600 hover:underline">{c.name}</Link></td>
                  <td className="px-4 py-3 text-gray-500">{c.client_name}</td>
                  <td className="px-4 py-3"><Badge status={c.status} /></td>
                  <td className="px-4 py-3 text-gray-500">{c.objective}</td>
                </tr>
              ))}
              {campaigns.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No campaigns — sync more accounts to see data</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Trends */}
      <TrendChart title={`${industry?.name || 'Industry'} Spend Trends`} />
    </div>
  );
}
