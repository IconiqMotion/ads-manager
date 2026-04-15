import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getById, getAdSets, getAdsForAdSet } from '../api/campaigns.api';
import Loader from '../components/common/Loader';
import Badge from '../components/common/Badge';
import KPICard from '../components/charts/KPICard';
import { currency, number, percent } from '../utils/formatters';

export default function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [adsets, setAdsets] = useState([]);
  const [adsByAdset, setAdsByAdset] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [campRes, adsetsRes] = await Promise.all([
          getById(id),
          getAdSets(id)
        ]);
        setCampaign(campRes.data.data);
        const sets = adsetsRes.data.data;
        setAdsets(sets);

        // Fetch ads per adset
        const adsMap = {};
        await Promise.all(sets.map(async (as) => {
          try {
            const res = await getAdsForAdSet(as.id);
            adsMap[as.id] = res.data.data;
          } catch { adsMap[as.id] = []; }
        }));
        setAdsByAdset(adsMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <Loader />;
  if (!campaign) return <p className="text-gray-500">Campaign not found</p>;

  const stats = campaign.stats || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">{campaign.name}</h2>
        <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
          <Badge status={campaign.status} />
          <span>{campaign.objective}</span>
          <span>{campaign.client_name}</span>
          <span>{campaign.account_name}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard title="Spend" value={currency(stats.total_spend)} color="blue" />
        <KPICard title="Impressions" value={number(stats.total_impressions)} color="purple" />
        <KPICard title="Clicks" value={number(stats.total_clicks)} color="green" />
        <KPICard title="Leads" value={number(stats.total_leads)} color="orange" />
      </div>

      {/* Ad Sets + Ads */}
      {adsets.map(as => (
        <div key={as.id} className="rounded-lg bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{as.name}</h3>
              <p className="text-xs text-gray-500">
                <Badge status={as.status} /> &middot; {as.optimization_goal}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            {(adsByAdset[as.id] || []).map(ad => (
              <Link key={ad.id} to={`/ads/${ad.id}`} className="block rounded border p-2 transition hover:shadow">
                {(ad.local_image || ad.image_url || ad.thumbnail_url) ? (
                  <img
                    src={ad.local_image ? `/media/${ad.local_image}` : (ad.image_url || ad.thumbnail_url)}
                    alt={ad.name}
                    className="mb-2 h-24 w-full rounded object-cover"
                  />
                ) : (
                  <div className="mb-2 flex h-24 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">No image</div>
                )}
                <p className="truncate text-xs font-medium text-gray-800">{ad.name}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Badge status={ad.status} />
                </div>
              </Link>
            ))}
            {(adsByAdset[as.id] || []).length === 0 && (
              <p className="col-span-full text-sm text-gray-400">No ads in this ad set</p>
            )}
          </div>
        </div>
      ))}
      {adsets.length === 0 && <p className="text-gray-400">No ad sets</p>}
    </div>
  );
}
