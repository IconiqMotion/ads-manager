import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { list as listIndustries } from '../api/industries.api';
import { getByIndustry } from '../api/dashboard.api';
import { useFilters } from '../context/FilterContext';
import Loader from '../components/common/Loader';
import { currency, percent, number } from '../utils/formatters';

export default function IndustryOverviewPage() {
  const [industries, setIndustries] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const { toQueryParams } = useFilters();
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [ind, st] = await Promise.all([
          listIndustries(),
          getByIndustry(toQueryParams())
        ]);
        setIndustries(ind.data.data);
        setStats(st.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toQueryParams]);

  if (loading) return <Loader />;

  const statsMap = {};
  stats.forEach(s => { statsMap[s.industry_id] = s; });

  return (
    <div>
      <h2 className="mb-4 text-xl font-bold text-gray-900">Industries</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {industries.map(ind => {
          const s = statsMap[ind.id] || {};
          return (
            <div
              key={ind.id}
              onClick={() => navigate(`/industries/${ind.id}`)}
              className="cursor-pointer rounded-lg bg-white p-4 shadow transition hover:shadow-md"
            >
              <h3 className="text-lg font-semibold text-gray-900">{ind.name}</h3>
              <div className="mt-3 space-y-1 text-sm text-gray-600">
                <p>{ind.client_count || 0} clients</p>
                <p>{s.campaign_count || 0} campaigns</p>
                <p>Spend: {currency(s.total_spend)}</p>
                <p>CTR: {percent(s.avg_ctr)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
