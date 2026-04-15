import { useState, useEffect } from 'react';
import api from '../../api/client';
import { useFilters } from '../../context/FilterContext';
import { currency, percent } from '../../utils/formatters';

export default function BenchmarkBars({ industryId }) {
  const { filters } = useFilters();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = { date_from: filters.date_from, date_to: filters.date_to };
        if (industryId) params.industry_id = industryId;
        const res = await api.get('/dashboard/benchmarks', { params });
        setData(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [industryId, filters.date_from, filters.date_to]);

  if (loading || !data) return null;
  if (!data.by_industry || data.by_industry.length === 0) return null;

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <h3 className="mb-1 text-lg font-semibold text-gray-800">Industry Benchmarks</h3>
      <p className="mb-4 text-xs text-gray-500">Average performance metrics per industry — compare CTR, CPC, and CPM across your client segments</p>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-500">Industry</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Avg CTR</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Avg CPC</th>
              <th className="px-4 py-2 text-right font-medium text-gray-500">Avg CPM</th>
              <th className="px-4 py-2 text-left font-medium text-gray-500">CTR Performance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.by_industry.map((ind, i) => {
              const maxCtr = Math.max(...data.by_industry.map(d => parseFloat(d.avg_ctr) || 0));
              const ctrPct = maxCtr > 0 ? (parseFloat(ind.avg_ctr) / maxCtr) * 100 : 0;
              const isHighlighted = String(ind.industry_id) === String(industryId);

              return (
                <tr key={ind.industry_id} className={`hover:bg-gray-50 ${isHighlighted ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-2 font-medium text-gray-800">
                    {ind.industry_name} {isHighlighted && <span className="text-xs text-blue-500">(current)</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{percent(ind.avg_ctr)}</td>
                  <td className="px-4 py-2 text-right">{currency(ind.avg_cpc)}</td>
                  <td className="px-4 py-2 text-right">{currency(ind.avg_cpm)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-gray-200">
                        <div className="h-2 rounded-full bg-blue-500" style={{ width: `${ctrPct}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
