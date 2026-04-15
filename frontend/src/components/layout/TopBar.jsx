import { useFilters } from '../../context/FilterContext';

export default function TopBar() {
  const { filters, updateFilter } = useFilters();

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        <label className="text-xs font-medium text-gray-500">From</label>
        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => updateFilter('date_from', e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <label className="text-xs font-medium text-gray-500">To</label>
        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => updateFilter('date_to', e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <div className="flex gap-1">
          {[7, 30, 90].map(days => (
            <button
              key={days}
              onClick={() => {
                const to = new Date().toISOString().split('T')[0];
                const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
                updateFilter('date_from', from);
                updateFilter('date_to', to);
              }}
              className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
            >
              {days}d
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
