import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getById, getPerformance, updateIndustry, classifyIndustry } from '../api/ads.api';
import api from '../api/client';
import { list as listIndustries } from '../api/industries.api';
import { useFilters } from '../context/FilterContext';
import Loader from '../components/common/Loader';
import Badge from '../components/common/Badge';
import KPICard from '../components/charts/KPICard';
import { currency, number, percent, dateShort } from '../utils/formatters';
import SimilarAds from '../components/SimilarAds';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function AdDetailPage() {
  const { id } = useParams();
  const { filters } = useFilters();
  const [ad, setAd] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingIndustry, setEditingIndustry] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [savingIndustry, setSavingIndustry] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [logoResult, setLogoResult] = useState(null);
  const [imgCacheBust, setImgCacheBust] = useState('');

  // Bust cache if image was already processed (nologo) on page load
  useEffect(() => {
    if (ad?.local_image?.includes('_nologo')) {
      setImgCacheBust('?t=' + Date.now());
    }
  }, [ad?.local_image]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [adRes, perfRes, indRes] = await Promise.all([
          getById(id),
          getPerformance(id, { date_from: filters.date_from, date_to: filters.date_to }),
          listIndustries()
        ]);
        setAd(adRes.data.data);
        setSnapshots(perfRes.data.data);
        setIndustries(indRes.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, filters.date_from, filters.date_to]);

  async function handleRemoveLogo() {
    setRemovingLogo(true);
    setLogoResult(null);
    try {
      const res = await api.post(`/intelligence/remove-logo/${id}`);
      const result = res.data.data;
      setLogoResult(result);
      if (result.found && result.outputPath) {
        // Force browser to load the new image by updating both path and cache bust
        const bust = '?t=' + Date.now();
        setImgCacheBust(bust);
        setAd(prev => ({ ...prev, local_image: result.outputPath }));
        // Also force the img element to reload by briefly clearing it
        const imgEl = document.querySelector('img[alt="' + ad.name + '"]');
        if (imgEl) {
          const newSrc = '/media/' + result.outputPath + bust;
          imgEl.removeAttribute('src');
          setTimeout(() => { imgEl.src = newSrc; }, 50);
        }
      }
    } catch (err) {
      setLogoResult({ found: false, message: err.response?.data?.error?.message || 'Failed to remove logo' });
    } finally {
      setRemovingLogo(false);
    }
  }

  async function handleIndustryChange(e) {
    const newId = e.target.value ? Number(e.target.value) : null;
    setSavingIndustry(true);
    try {
      const res = await updateIndustry(id, newId);
      setAd(prev => ({ ...prev, industry_id: res.data.data.industry_id, industry_name: res.data.data.industry_name }));
    } catch (err) { console.error(err); }
    finally { setSavingIndustry(false); setEditingIndustry(false); }
  }

  async function handleClassify() {
    setClassifying(true);
    try {
      const res = await classifyIndustry(id);
      const { industry_id, industry_name } = res.data.data;
      setAd(prev => ({ ...prev, industry_id, industry_name }));
    } catch (err) { console.error(err); }
    finally { setClassifying(false); }
  }

  if (loading) return <Loader />;
  if (!ad) return <p className="text-gray-500">Ad not found</p>;

  const totals = snapshots.reduce((acc, s) => ({
    spend: acc.spend + (parseFloat(s.spend) || 0),
    impressions: acc.impressions + (parseInt(s.impressions) || 0),
    clicks: acc.clicks + (parseInt(s.clicks) || 0),
    leads: acc.leads + (parseInt(s.leads) || 0)
  }), { spend: 0, impressions: 0, clicks: 0, leads: 0 });

  const chartData = snapshots.map(s => ({
    date: dateShort(s.date),
    spend: parseFloat(s.spend) || 0,
    clicks: parseInt(s.clicks) || 0,
    impressions: parseInt(s.impressions) || 0
  }));

  return (
    <div className="space-y-6">
      {/* Industry bar at the top */}
      <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <span className="text-sm font-medium text-gray-500">Industry:</span>

        {editingIndustry ? (
          <div className="flex items-center gap-2">
            <select
              autoFocus
              defaultValue={ad.industry_id || ''}
              onChange={handleIndustryChange}
              disabled={savingIndustry}
              className="rounded border border-blue-400 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— No industry —</option>
              {industries.map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
            <button onClick={() => setEditingIndustry(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
        ) : (
          <>
            <span className="rounded bg-blue-50 px-2 py-1 text-sm font-medium text-blue-700">
              {ad.industry_name || '—'}
            </span>
            <button
              onClick={() => setEditingIndustry(true)}
              className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
            >
              ✏️ Override
            </button>
            <button
              onClick={handleClassify}
              disabled={classifying}
              className="rounded border border-purple-200 bg-purple-50 px-2 py-1 text-xs text-purple-600 hover:bg-purple-100 disabled:opacity-50"
            >
              {classifying ? '⏳ Classifying...' : '✨ Auto-classify'}
            </button>
            {ad.industry_id && ad.industry_id !== ad.resolved_industry_id && (
              <span className="text-xs text-gray-400 italic">manually set</span>
            )}
          </>
        )}
      </div>

      <div className="flex gap-6">
        {/* Creative preview */}
        <div className="w-64 flex-shrink-0">
          {(ad.local_video || ad.video_url) ? (
            <video
              src={ad.local_video ? `/media/${ad.local_video}` : ad.video_url}
              poster={ad.local_image ? `/media/${ad.local_image}` : (ad.thumbnail_url || ad.image_url)}
              controls
              className="w-full rounded-lg shadow"
            />
          ) : (ad.local_image || ad.image_url || ad.thumbnail_url) ? (
            <img
              src={ad.local_image ? `/media/${ad.local_image}${imgCacheBust}` : (ad.image_url || ad.thumbnail_url)}
              alt={ad.name}
              className="w-full rounded-lg shadow"
            />
          ) : (
            <div className="flex h-64 w-full items-center justify-center rounded-lg bg-gray-100 text-gray-400">No image</div>
          )}
          {(ad.local_image || ad.image_url) && !ad.video_url && (
            <div className="mt-2">
              <button
                onClick={handleRemoveLogo}
                disabled={removingLogo}
                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              >
                {removingLogo ? 'Detecting logo…' : 'Remove Logo'}
              </button>
              {logoResult && (
                <p className={`mt-1 text-xs ${logoResult.found ? 'text-green-600' : 'text-gray-400'}`}>
                  {logoResult.message}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">{ad.name}</h2>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
            <Badge status={ad.status} />
            <span>{ad.campaign_name}</span>
            <Link to={`/clients/${ad.client_id}`} className="text-blue-600 hover:underline">{ad.client_name}</Link>
          </div>

          {ad.body_text && (
            <div className="mt-3 rounded bg-gray-50 p-3 text-sm text-gray-700">{ad.body_text}</div>
          )}

          <div className="mt-3 text-xs text-gray-400">
            {ad.cta_type && <span>CTA: {ad.cta_type}</span>}
            {ad.link_url && <span> &middot; <a href={ad.link_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Link</a></span>}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard title="Total Spend" value={currency(totals.spend)} color="blue" />
        <KPICard title="Impressions" value={number(totals.impressions)} color="purple" />
        <KPICard title="Clicks" value={number(totals.clicks)} color="green" />
        <KPICard title="Leads" value={number(totals.leads)} color="orange" />
        <KPICard title="CTR" value={percent(totals.impressions > 0 ? (totals.clicks / totals.impressions * 100) : 0)} color="green" />
        <KPICard title="CPC" value={currency(totals.clicks > 0 ? totals.spend / totals.clicks : 0)} color="blue" />
        <KPICard title="CPM" value={currency(totals.impressions > 0 ? totals.spend / totals.impressions * 1000 : 0)} color="purple" />
        <KPICard title="Days of data" value={snapshots.length} color="orange" />
      </div>

      {/* Performance chart */}
      {chartData.length > 0 && (
        <div className="rounded-lg bg-white p-4 shadow">
          <h3 className="mb-3 text-lg font-semibold text-gray-800">Daily Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line yAxisId="left" type="monotone" dataKey="spend" stroke="#3b82f6" name="Spend (₪)" strokeWidth={2} />
              <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#10b981" name="Clicks" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <SimilarAds adId={id} />
    </div>
  );
}
