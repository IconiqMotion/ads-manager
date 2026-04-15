import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getById, update as updateClient } from '../api/clients.api';
import { list as listIndustries } from '../api/industries.api';
import { list as listCampaigns, getAdSets, getAdsForAdSet } from '../api/campaigns.api';
import Loader from '../components/common/Loader';
import TrendChart from '../components/charts/TrendChart';
import RecommendationsPanel from '../components/RecommendationsPanel';
import KPICard from '../components/charts/KPICard';
import Badge from '../components/common/Badge';
import { currency } from '../utils/formatters';

function AdThumb({ ad }) {
  // Priority: local_image > image_url > thumbnail_url (works for both image & video ads)
  const src = ad.local_image
    ? `/media/${ad.local_image}`
    : (ad.image_url || ad.thumbnail_url);
  const isVideo = !!(ad.local_video || ad.video_url);

  return (
    <Link to={`/ads/${ad.id}`} className="block rounded border bg-white p-1.5 hover:shadow transition">
      <div className="relative mb-1 h-20 w-full overflow-hidden rounded bg-gray-100">
        {src ? (
          <>
            <img src={src} alt={ad.name} className="h-full w-full object-cover" />
            {isVideo && (
              <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">▶</span>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-400">No image</div>
        )}
      </div>
      <p className="truncate text-xs text-gray-700">{ad.name}</p>
      <div className="mt-0.5 flex items-center justify-between">
        <Badge status={ad.status} />
      </div>
      {parseFloat(ad.total_spend) > 0 && (
        <div className="mt-1 grid grid-cols-2 gap-x-1 text-[10px] text-gray-500">
          <span>₪{parseFloat(ad.total_spend).toFixed(0)}</span>
          <span>{parseFloat(ad.ctr).toFixed(1)}% CTR</span>
          <span>{ad.total_leads} leads</span>
          <span>₪{parseFloat(ad.cpc).toFixed(2)} CPC</span>
        </div>
      )}
    </Link>
  );
}

function CampaignRow({ campaign }) {
  const [open, setOpen] = useState(false);
  const [adsets, setAdsets] = useState(null);
  const [adsByAdset, setAdsByAdset] = useState({});
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setOpen(o => !o);
    if (adsets !== null) return;
    setLoading(true);
    try {
      const res = await getAdSets(campaign.id);
      const sets = res.data.data;
      setAdsets(sets);
      const map = {};
      await Promise.all(sets.map(async as => {
        try {
          const r = await getAdsForAdSet(as.id);
          map[as.id] = r.data.data;
        } catch { map[as.id] = []; }
      }));
      setAdsByAdset(map);
    } catch { setAdsets([]); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-white shadow-sm">
      <button
        onClick={toggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-900">{campaign.name}</span>
          <Badge status={campaign.status} />
          <span className="text-xs text-gray-400">{campaign.objective}</span>
          <span className="text-xs text-gray-400">{campaign.account_name || campaign.ad_account_id}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/campaigns/${campaign.id}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-500 hover:underline">Details →</Link>
          <span className="text-gray-400">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3">
          {loading && <p className="text-sm text-gray-400">Loading ads...</p>}
          {!loading && adsets?.length === 0 && <p className="text-sm text-gray-400">No ad sets</p>}
          {!loading && adsets?.map(as => (
            <div key={as.id} className="mb-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {as.name} <Badge status={as.status} />
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {(adsByAdset[as.id] || []).map(ad => <AdThumb key={ad.id} ad={ad} />)}
                {(adsByAdset[as.id] || []).length === 0 && (
                  <p className="col-span-full text-xs text-gray-400">No ads</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [industries, setIndustries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingIndustry, setEditingIndustry] = useState(false);
  const [savingIndustry, setSavingIndustry] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [cl, camp, ind] = await Promise.all([
          getById(id),
          listCampaigns({ client_id: id, limit: 100 }),
          listIndustries()
        ]);
        setClient(cl.data.data);
        setCampaigns(camp.data.data);
        setIndustries(ind.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleIndustryChange(e) {
    const newIndustryId = e.target.value ? Number(e.target.value) : null;
    setSavingIndustry(true);
    try {
      await updateClient(id, { industry_id: newIndustryId });
      const industry = industries.find(i => i.id === newIndustryId);
      setClient(prev => ({ ...prev, industry_id: newIndustryId, industry_name: industry?.name || null }));
    } catch (err) { console.error(err); }
    finally { setSavingIndustry(false); setEditingIndustry(false); }
  }

  if (loading) return <Loader />;
  if (!client) return <p className="text-gray-500">Client not found</p>;

  return (
    <div className="space-y-6">
      {/* Client header */}
      <div className="flex items-start gap-4">
        {client.logo_url && <img src={client.logo_url} alt="logo" className="h-16 w-16 rounded-lg object-cover" />}
        <div>
          <h2 className="text-xl font-bold text-gray-900">{client.client_name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm text-gray-500">{client.brand_name}</span>
            {client.brand_name && <span className="text-gray-300">&middot;</span>}
            {editingIndustry ? (
              <div className="flex items-center gap-1">
                <select
                  autoFocus
                  defaultValue={client.industry_id || ''}
                  onChange={handleIndustryChange}
                  disabled={savingIndustry}
                  className="text-sm border border-blue-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">— No industry —</option>
                  {industries.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <button onClick={() => setEditingIndustry(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-500">{client.industry_name || '—'}</span>
                <button
                  onClick={() => setEditingIndustry(true)}
                  className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-100"
                >✏️ Change</button>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400">Manager: {client.account_manager || '—'} · Phone: {client.contact_phone || '—'}</p>
          {client.drive_url && <a href={client.drive_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">Drive folder</a>}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard title="Total Spend" value={currency(client.total_spend)} color="blue" />
        <KPICard title="Ad Accounts" value={client.ad_account_count} color="purple" />
        <KPICard title="Campaigns" value={client.campaign_count} color="green" />
        <KPICard title="Fireberry ID" value={client.fireberry_account_id || '—'} color="orange" />
      </div>

      {/* Campaigns with expandable ads */}
      <div>
        <h3 className="mb-3 text-lg font-semibold">Campaigns</h3>
        <div className="space-y-2">
          {campaigns.map(c => <CampaignRow key={c.id} campaign={c} />)}
          {campaigns.length === 0 && <p className="text-gray-400 text-sm">No campaigns</p>}
        </div>
      </div>

      <TrendChart title="Client Trends" />
      <RecommendationsPanel clientId={id} />

      <a href={`/api/v1/export/csv?type=campaigns`} target="_blank" rel="noreferrer"
        className="inline-block rounded bg-gray-100 px-4 py-2 text-sm text-gray-600 hover:bg-gray-200">
        Export Campaigns CSV
      </a>
    </div>
  );
}
