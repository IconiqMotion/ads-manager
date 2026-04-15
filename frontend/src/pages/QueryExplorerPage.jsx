import { useState } from 'react';
import { rawQuery, builderQuery, getSchema, listSaved, runSaved } from '../api/query.api';
import { useAuth } from '../hooks/useAuth';
import Loader from '../components/common/Loader';

export default function QueryExplorerPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('builder');
  const [sql, setSql] = useState('SELECT name, client_count FROM industries ORDER BY name');
  const [entity, setEntity] = useState('clients');
  const [limit, setLimit] = useState(50);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRawQuery() {
    setLoading(true); setError(''); setResults(null);
    try {
      const res = await rawQuery({ sql, limit });
      setResults(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally { setLoading(false); }
  }

  async function handleBuilderQuery() {
    setLoading(true); setError(''); setResults(null);
    try {
      const res = await builderQuery({ entity, fields: [], filters: {}, limit });
      setResults(res.data.data);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally { setLoading(false); }
  }

  const rows = results?.rows || [];
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">Query Explorer</h2>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {user?.role === 'admin' && (
          <button
            onClick={() => setTab('raw')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'raw' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
          >Raw SQL</button>
        )}
        <button
          onClick={() => setTab('builder')}
          className={`px-4 py-2 text-sm font-medium ${tab === 'builder' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
        >Builder</button>
      </div>

      {/* Raw SQL */}
      {tab === 'raw' && user?.role === 'admin' && (
        <div className="space-y-3">
          <textarea
            value={sql} onChange={(e) => setSql(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-gray-300 p-3 font-mono text-sm focus:border-blue-500 focus:outline-none"
            placeholder="SELECT ..."
          />
          <div className="flex items-center gap-3">
            <button onClick={handleRawQuery} disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Running...' : 'Run Query'}
            </button>
            <label className="text-sm text-gray-500">
              Limit: <input type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value) || 50)}
                className="ml-1 w-20 rounded border px-2 py-1 text-sm" />
            </label>
          </div>
        </div>
      )}

      {/* Builder */}
      {tab === 'builder' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Entity:</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm">
              {['clients', 'campaigns', 'adsets', 'ads', 'performance_snapshots', 'industries', 'ad_accounts'].map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <label className="text-sm text-gray-500">
              Limit: <input type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value) || 50)}
                className="ml-1 w-20 rounded border px-2 py-1 text-sm" />
            </label>
            <button onClick={handleBuilderQuery} disabled={loading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Running...' : 'Query'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Results */}
      {loading && <Loader />}
      {rows.length > 0 && (
        <div>
          <p className="mb-2 text-sm text-gray-500">{results.rowCount} rows &middot; {results.duration}ms</p>
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map(col => (
                    <th key={col} className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    {columns.map(col => (
                      <td key={col} className="whitespace-nowrap px-3 py-2 text-gray-700">
                        {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
