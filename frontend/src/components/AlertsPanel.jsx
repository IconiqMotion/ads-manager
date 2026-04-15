import { useState, useEffect } from 'react';
import { listTriggers, unreadCount, markRead, listRules, createRule, deleteRule } from '../api/alerts.api';
import { date } from '../utils/formatters';

export default function AlertsPanel() {
  const [triggers, setTriggers] = useState([]);
  const [rules, setRules] = useState([]);
  const [unread, setUnread] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', metric: 'ctr', condition: 'lt', threshold: '' });

  async function loadData() {
    try {
      const [t, u, r] = await Promise.all([
        listTriggers({ limit: 10, unread: 'true' }),
        unreadCount(),
        listRules()
      ]);
      setTriggers(t.data.data);
      setUnread(u.data.data.unread);
      setRules(r.data.data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleMarkAllRead() {
    const ids = triggers.filter(t => !t.is_read).map(t => t.id);
    if (ids.length === 0) return;
    await markRead(ids);
    await loadData();
  }

  async function handleCreateRule() {
    if (!newRule.name || !newRule.threshold) return;
    await createRule({ ...newRule, threshold: parseFloat(newRule.threshold) });
    setNewRule({ name: '', metric: 'ctr', condition: 'lt', threshold: '' });
    await loadData();
  }

  async function handleDeleteRule(id) {
    await deleteRule(id);
    await loadData();
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">
          Alerts {unread > 0 && <span className="ml-2 inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{unread}</span>}
        </h3>
        <div className="flex gap-2">
          <button onClick={handleMarkAllRead} className="text-xs text-blue-500 hover:underline">Mark all read</button>
          <button onClick={() => setShowRules(!showRules)} className="text-xs text-gray-500 hover:underline">{showRules ? 'Hide' : 'Manage'} Rules</button>
        </div>
      </div>

      {/* Triggers */}
      {triggers.length > 0 ? (
        <div className="space-y-2 mb-4">
          {triggers.map(t => (
            <div key={t.id} className={`rounded border-l-4 p-2 text-sm ${t.is_read ? 'border-gray-300 bg-gray-50' : 'border-red-400 bg-red-50'}`}>
              <p className="font-medium text-gray-800">{t.rule_name}: {t.entity_name}</p>
              <p className="text-xs text-gray-500">
                {t.metric} = {parseFloat(t.value).toFixed(2)} (threshold: {t.condition} {parseFloat(t.threshold).toFixed(2)}) — {date(t.triggered_at)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-4 text-sm text-gray-400">No alerts</p>
      )}

      {/* Rules */}
      {showRules && (
        <div className="border-t pt-3">
          <h4 className="mb-2 text-sm font-medium text-gray-700">Alert Rules</h4>
          <div className="mb-3 flex gap-2">
            <input placeholder="Rule name" value={newRule.name} onChange={e => setNewRule({...newRule, name: e.target.value})}
              className="flex-1 rounded border px-2 py-1 text-xs" />
            <select value={newRule.metric} onChange={e => setNewRule({...newRule, metric: e.target.value})} className="rounded border px-1 py-1 text-xs">
              {['ctr', 'cpc', 'cpm', 'spend', 'leads', 'roas'].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
            <select value={newRule.condition} onChange={e => setNewRule({...newRule, condition: e.target.value})} className="rounded border px-1 py-1 text-xs">
              <option value="lt">&lt;</option><option value="gt">&gt;</option><option value="eq">=</option>
            </select>
            <input type="number" placeholder="Value" value={newRule.threshold} onChange={e => setNewRule({...newRule, threshold: e.target.value})}
              className="w-20 rounded border px-2 py-1 text-xs" />
            <button onClick={handleCreateRule} className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">Add</button>
          </div>
          <div className="space-y-1">
            {rules.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded bg-gray-50 px-2 py-1 text-xs">
                <span>{r.name}: {r.metric} {r.condition} {parseFloat(r.threshold).toFixed(2)}</span>
                <button onClick={() => handleDeleteRule(r.id)} className="text-red-500 hover:text-red-700">X</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
