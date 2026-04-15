import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSimilarAds } from '../api/intelligence.api';
import { currency, percent } from '../utils/formatters';

export default function SimilarAds({ adId }) {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adId) return;
    async function load() {
      try {
        const res = await getSimilarAds(adId, 6);
        setAds(res.data.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [adId]);

  if (loading || ads.length === 0) return null;

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <h3 className="mb-3 text-lg font-semibold text-gray-800">Similar Winning Ads</h3>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {ads.map(ad => (
          <Link key={ad.id} to={`/ads/${ad.id}`} className="block rounded border p-2 transition hover:shadow">
            {(ad.local_image || ad.image_url) ? (
              <img src={ad.local_image ? `/media/${ad.local_image}` : ad.image_url} alt={ad.name}
                className="mb-2 h-20 w-full rounded object-cover" />
            ) : (
              <div className="mb-2 flex h-20 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">No img</div>
            )}
            <p className="truncate text-xs font-medium">{ad.name}</p>
            <p className="truncate text-xs text-gray-500">{ad.client_name}</p>
            <div className="mt-1 text-xs text-gray-600">
              CTR {percent(ad.avg_ctr)} &middot; {currency(ad.total_spend)}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
