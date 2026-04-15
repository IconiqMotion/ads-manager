import { useState, useEffect } from 'react';
import { statusList, triggerAll } from '../api/sync.api';
import { getStatus as getFireberryStatus, syncAll as fireberrySyncAll } from '../api/fireberry.api';
import Loader from '../components/common/Loader';
import { date } from '../utils/formatters';

export default function SyncStatusPage() {
  const [logs, setLogs] = useState([]);
  const [fbStatus, setFbStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [sl, fb] = await Promise.all([
        statusList({ limit: 20 }),
        getFireberryStatus()
      ]);
      setLogs(sl.data.data);
      setFbStatus(fb.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleFullSync() {
    setSyncing(true);
    try {
      await triggerAll();
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <Loader />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Sync Status</h2>
        <button
          onClick={handleFullSync} disabled={syncing}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Trigger Full Sync'}
        </button>
      </div>

      {/* Fireberry Status */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="mb-2 text-lg font-semibold">Fireberry</h3>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <div>
            <p className="text-gray-500">Token</p>
            <p className={fbStatus?.fireberry_token_configured ? 'font-medium text-green-600' : 'font-medium text-red-600'}>
              {fbStatus?.fireberry_token_configured ? 'Configured' : 'Not set'}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Clients synced</p>
            <p className="font-medium">{fbStatus?.clients_from_fireberry || 0}</p>
          </div>
          <div>
            <p className="text-gray-500">Tokens synced</p>
            <p className="font-medium">{fbStatus?.tokens_from_fireberry || 0}</p>
          </div>
          <div>
            <p className="text-gray-500">Last client sync</p>
            <p className="font-medium">{fbStatus?.last_client_sync ? date(fbStatus.last_client_sync.completed_at) : 'Never'}</p>
          </div>
        </div>
      </div>

      {/* Sync Logs */}
      <div className="overflow-x-auto rounded-lg bg-white shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Account</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Token Source</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Records</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Started</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {logs.map(l => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{l.sync_type}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    l.status === 'completed' ? 'bg-green-100 text-green-800'
                    : l.status === 'running' ? 'bg-blue-100 text-blue-800'
                    : 'bg-red-100 text-red-800'
                  }`}>{l.status}</span>
                </td>
                <td className="px-4 py-3 text-gray-500">{l.ad_account_id || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{l.token_source || '—'}</td>
                <td className="px-4 py-3 text-right">{l.records_synced}</td>
                <td className="px-4 py-3 text-gray-500">{date(l.started_at)}</td>
                <td className="px-4 py-3 text-xs text-red-500">{l.error_message || ''}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No sync logs yet</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
