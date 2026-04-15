import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { createApiKey, listApiKeys, deleteApiKey } from '../api/auth.api';

export default function SettingsPage() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadKeys() {
    try {
      const res = await listApiKeys();
      setApiKeys(res.data.data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => { loadKeys(); }, []);

  async function handleCreateKey() {
    if (!newKeyName) return;
    setLoading(true);
    try {
      const res = await createApiKey({ name: newKeyName });
      setNewKey(res.data.data.key);
      setNewKeyName('');
      await loadKeys();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteKey(id) {
    try {
      await deleteApiKey(id);
      await loadKeys();
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Settings</h2>

      {/* User Info */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="mb-2 text-lg font-semibold">User</h3>
        <p className="text-sm text-gray-600">{user?.email} &middot; {user?.role}</p>
      </div>

      {/* API Keys */}
      <div className="rounded-lg bg-white p-4 shadow">
        <h3 className="mb-3 text-lg font-semibold">API Keys</h3>

        <div className="mb-4 flex gap-2">
          <input
            type="text" placeholder="Key name..."
            value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button onClick={handleCreateKey} disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Create Key
          </button>
        </div>

        {newKey && (
          <div className="mb-4 rounded bg-green-50 p-3">
            <p className="text-xs font-medium text-green-800">New API Key (copy now, won't be shown again):</p>
            <code className="mt-1 block break-all text-sm text-green-900">{newKey}</code>
          </div>
        )}

        <div className="space-y-2">
          {apiKeys.map(k => (
            <div key={k.id} className="flex items-center justify-between rounded border p-2">
              <div>
                <p className="text-sm font-medium">{k.name}</p>
                <p className="text-xs text-gray-400">Last used: {k.last_used || 'Never'} &middot; {k.permissions}</p>
              </div>
              <button onClick={() => handleDeleteKey(k.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
            </div>
          ))}
          {apiKeys.length === 0 && <p className="text-sm text-gray-400">No API keys</p>}
        </div>
      </div>
    </div>
  );
}
