import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useFilters } from '../context/FilterContext';
import { gallery } from '../api/ads.api';
import { list as listIndustries } from '../api/industries.api';
import Loader from '../components/common/Loader';
import Pagination from '../components/common/Pagination';
import Badge from '../components/common/Badge';
import { currency, percent } from '../utils/formatters';
import { KPI_SORT_OPTIONS, STATUS_OPTIONS } from '../utils/constants';

export default function CreativeGalleryPage() {
  const { toQueryParams } = useFilters();
  const [ads, setAds] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('spend');
  const [industryFilter, setIndustryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load industries for filter dropdown
  useEffect(() => {
    listIndustries().then(res => {
      setIndustries(res.data.data.filter(i => i.client_count > 0).sort((a, b) => b.client_count - a.client_count));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = { ...toQueryParams(), page, limit: 24, sort };
        if (industryFilter) params.industry = industryFilter;
        if (statusFilter) params.status = statusFilter;
        const res = await gallery(params);
        setAds(res.data.data);
        setTotal(res.data.meta.total);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [toQueryParams, page, sort, industryFilter, statusFilter]);

  function resetFilters() {
    setIndustryFilter('');
    setStatusFilter('');
    setSort('spend');
    setPage(1);
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">Creative Gallery</h2>
          <span className="text-sm text-gray-400">{total} ads</span>
          <a href="/api/v1/export/csv?type=ads" target="_blank" rel="noreferrer"
            className="rounded bg-gray-100 px-3 py-1 text-xs text-gray-600 hover:bg-gray-200">Export CSV</a>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Industry</label>
          <select
            value={industryFilter}
            onChange={(e) => { setIndustryFilter(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All Industries</option>
            {industries.map(i => (
              <option key={i.id} value={i.id}>{i.name} ({i.client_count})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Sort by</label>
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            {KPI_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {(industryFilter || statusFilter) && (
          <div className="flex items-end">
            <button onClick={resetFilters} className="rounded bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200">
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? <Loader /> : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
            {ads.map(ad => (
              <Link key={ad.id} to={`/ads/${ad.id}`} className="block rounded-lg bg-white shadow transition hover:shadow-md">
                <div className="aspect-square overflow-hidden rounded-t-lg bg-gray-100 relative">
                  {ad.video_url ? (
                    <video
                      src={ad.video_url}
                      poster={ad.thumbnail_url || ad.image_url}
                      className="h-full w-full object-cover"
                      muted preload="metadata"
                      onMouseEnter={(e) => e.target.play().catch(() => {})}
                      onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                    />
                  ) : (ad.local_image || ad.image_url) ? (
                    <img
                      src={ad.local_image ? `/media/${ad.local_image}` : ad.image_url}
                      alt={ad.name} className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-gray-300">No image</div>
                  )}
                  {ad.video_url && (
                    <div className="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">VIDEO</div>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-gray-800">{ad.name}</p>
                  <p className="truncate text-xs text-gray-500">{ad.client_name}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <Badge status={ad.status} />
                    {ad.industry_name && <span className="truncate text-xs text-gray-400">{ad.industry_name}</span>}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-600">
                    <span>Spend: {currency(ad.total_spend)}</span>
                    <span>CTR: {percent(ad.avg_ctr)}</span>
                    <span>CPC: {currency(ad.avg_cpc)}</span>
                    <span>Leads: {ad.total_leads || 0}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {ads.length === 0 && <p className="mt-8 text-center text-gray-400">No creatives found for this filter.</p>}
          <Pagination page={page} limit={24} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
