import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { list as listClients } from '../api/clients.api';
import Loader from '../components/common/Loader';
import Pagination from '../components/common/Pagination';

export default function ClientListPage() {
  const [clients, setClients] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params = { page, limit: 25 };
        if (search) params.search = search;
        const res = await listClients(params);
        setClients(res.data.data);
        setTotal(res.data.meta.total);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [page, search]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Clients</h2>
        <input
          type="text" placeholder="Search clients..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {loading ? <Loader /> : (
        <>
          <div className="overflow-x-auto rounded-lg bg-white shadow">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Client</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Brand</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Industry</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Manager</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {clients.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/clients/${c.id}`} className="font-medium text-blue-600 hover:underline">{c.client_name}</Link>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{c.brand_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.industry_name || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.account_manager || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{c.contact_phone || '—'}</td>
                  </tr>
                ))}
                {clients.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No clients found</td></tr>}
              </tbody>
            </table>
          </div>
          <Pagination page={page} limit={25} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
