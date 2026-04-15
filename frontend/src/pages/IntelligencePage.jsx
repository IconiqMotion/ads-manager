import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { getIndustryStyles, getSimilarAds, findSimilarByImage } from '../api/intelligence.api';
import { list as listIndustries } from '../api/industries.api';
import Loader from '../components/common/Loader';
import { percent } from '../utils/formatters';

export default function IntelligencePage() {
  const [tab, setTab] = useState('styles'); // 'styles' | 'similar' | 'image'

  // Industry styles state
  const [industries, setIndustries] = useState([]);
  const [selectedIndustry, setSelectedIndustry] = useState('');
  const [styles, setStyles] = useState(null);
  const [loadingStyles, setLoadingStyles] = useState(false);

  // Similar ads state
  const [adId, setAdId] = useState('');
  const [similarAds, setSimilarAds] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [similarError, setSimilarError] = useState('');

  // Image similarity state
  const [imagePreview, setImagePreview] = useState(null);
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [imageResults, setImageResults] = useState([]);
  const [imageDescription, setImageDescription] = useState('');
  const [loadingImage, setLoadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    listIndustries().then(res => {
      setIndustries(res.data.data.filter(i => i.client_count > 0).sort((a, b) => b.client_count - a.client_count));
    }).catch(() => {});
  }, []);

  function loadStyles() {
    if (!selectedIndustry) return;
    setLoadingStyles(true);
    setStyles(null);
    getIndustryStyles(selectedIndustry)
      .then(res => setStyles(res.data.data))
      .catch(() => setStyles({ ads: [] }))
      .finally(() => setLoadingStyles(false));
  }

  function loadSimilar() {
    if (!adId.trim()) return;
    setLoadingSimilar(true);
    setSimilarAds([]);
    setSimilarError('');
    getSimilarAds(adId.trim(), 12)
      .then(res => {
        if (res.data.error) throw new Error(res.data.error.message);
        setSimilarAds(res.data.data);
      })
      .catch(err => setSimilarError(err.message || 'Ad not found'))
      .finally(() => setLoadingSimilar(false));
  }

  function handleImageFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      setImagePreview(e.target.result);
      setImageDataUrl(e.target.result);
      setImageResults([]);
      setImageDescription('');
      setImageError('');
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleImageFile(file);
  }

  function searchByImage() {
    if (!imageDataUrl) return;
    setLoadingImage(true);
    setImageResults([]);
    setImageDescription('');
    setImageError('');
    findSimilarByImage(imageDataUrl, 12)
      .then(res => {
        setImageDescription(res.data.data.description);
        setImageResults(res.data.data.results);
      })
      .catch(err => setImageError(err.response?.data?.error?.message || err.message || 'Search failed'))
      .finally(() => setLoadingImage(false));
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-xl font-bold text-gray-900">Intelligence</h2>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-2 border-b border-gray-200">
        {[['styles', 'Industry Styles'], ['similar', 'Similar Ads'], ['image', 'Search by Image']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Industry Styles Tab */}
      {tab === 'styles' && (
        <div>
          <div className="mb-4 flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Select Industry</label>
              <select
                value={selectedIndustry}
                onChange={e => setSelectedIndustry(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm min-w-48"
              >
                <option value="">-- choose --</option>
                {industries.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.client_count})</option>
                ))}
              </select>
            </div>
            <button
              onClick={loadStyles}
              disabled={!selectedIndustry || loadingStyles}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Load
            </button>
          </div>

          {loadingStyles && <Loader />}

          {styles && (
            <div>
              {styles.byStyle && Object.keys(styles.byStyle).length > 0 ? (
                Object.entries(styles.byStyle).map(([style, ads]) => (
                  <div key={style} className="mb-6">
                    <h3 className="mb-2 text-sm font-semibold text-gray-700 capitalize">
                      {style} <span className="text-xs font-normal text-gray-400">({ads.length} ads)</span>
                    </h3>
                    <div className="grid grid-cols-3 gap-3 md:grid-cols-5 lg:grid-cols-6">
                      {ads.map(ad => <AdCard key={ad.id} ad={ad} />)}
                    </div>
                  </div>
                ))
              ) : (
                <div>
                  {styles.ads?.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3 md:grid-cols-5 lg:grid-cols-6">
                      {styles.ads.map(ad => <AdCard key={ad.id} ad={ad} />)}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No tagged ads for this industry yet. Run tag-batch first.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Similar Ads Tab */}
      {tab === 'similar' && (
        <div>
          <div className="mb-4 flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Ad ID</label>
              <input
                type="text"
                value={adId}
                onChange={e => setAdId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && loadSimilar()}
                placeholder="e.g. 120242210997450556"
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm w-64"
              />
            </div>
            <button
              onClick={loadSimilar}
              disabled={!adId.trim() || loadingSimilar}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              Find Similar
            </button>
          </div>

          {similarError && <p className="mb-3 text-sm text-red-500">{similarError}</p>}
          {loadingSimilar && <Loader />}

          {similarAds.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-gray-400">{similarAds.length} similar ads found</p>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6">
                {similarAds.map(ad => <AdCard key={ad.id} ad={ad} showCtr />)}
              </div>
            </div>
          )}

          {!loadingSimilar && similarAds.length === 0 && adId && !similarError && (
            <p className="text-sm text-gray-400">No similar ads found.</p>
          )}
        </div>
      )}

      {/* Image Similarity Tab */}
      {tab === 'image' && (
        <div>
          <p className="mb-3 text-xs text-gray-500">Upload an image to find visually similar ads using AI embeddings.</p>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 p-6 hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            {imagePreview ? (
              <img src={imagePreview} alt="preview" className="max-h-48 max-w-xs rounded-lg object-contain shadow" />
            ) : (
              <>
                <div className="mb-2 text-3xl text-gray-300">📷</div>
                <p className="text-sm text-gray-500">Drop an image here or click to upload</p>
                <p className="mt-1 text-xs text-gray-400">JPG, PNG, WebP</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleImageFile(e.target.files[0])}
            />
          </div>

          <div className="mb-4 flex gap-2">
            <button
              onClick={searchByImage}
              disabled={!imageDataUrl || loadingImage}
              className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {loadingImage ? 'Searching…' : 'Find Similar Ads'}
            </button>
            {imagePreview && (
              <button
                onClick={() => { setImagePreview(null); setImageDataUrl(null); setImageResults([]); setImageDescription(''); setImageError(''); }}
                className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>

          {imageError && <p className="mb-3 text-sm text-red-500">{imageError}</p>}
          {loadingImage && <Loader />}

          {imageDescription && (
            <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2">
              <p className="text-xs font-medium text-blue-700">AI Description</p>
              <p className="mt-0.5 text-xs text-blue-600">{imageDescription}</p>
            </div>
          )}

          {imageResults.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-gray-400">{imageResults.length} similar ads found</p>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6">
                {imageResults.map(ad => <AdCard key={ad.id} ad={ad} showCtr showScore />)}
              </div>
            </div>
          )}

          {!loadingImage && imageResults.length === 0 && imageDataUrl && !imageError && imageDescription && (
            <p className="text-sm text-gray-400">No similar ads found. Try running backfill-embeddings first.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AdCard({ ad, showCtr, showScore }) {
  const img = ad.local_image ? `/media/${ad.local_image}` : ad.image_url;
  const tags = typeof ad.ai_tags === 'string' ? JSON.parse(ad.ai_tags || '{}') : (ad.ai_tags || {});

  return (
    <Link to={`/ads/${ad.id}`} className="block rounded-lg bg-white shadow hover:shadow-md transition">
      <div className="aspect-square overflow-hidden rounded-t-lg bg-gray-100">
        {img ? (
          <img src={img} alt={ad.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-300 text-xs">No image</div>
        )}
      </div>
      <div className="p-2">
        <p className="truncate text-xs font-medium text-gray-800">{ad.name}</p>
        <p className="truncate text-xs text-gray-400">{ad.client_name}</p>
        {tags.style && (
          <span className="mt-1 inline-block rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">{tags.style}</span>
        )}
        {tags.mood && (
          <span className="mt-1 ml-1 inline-block rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-600">{tags.mood}</span>
        )}
        {showCtr && (
          <p className="mt-1 text-xs text-gray-500">CTR: {percent(ad.avg_ctr)}</p>
        )}
        {showScore && ad.score != null && (
          <p className="mt-1 text-xs text-green-600">Match: {Math.round(ad.score * 100)}%</p>
        )}
      </div>
    </Link>
  );
}
