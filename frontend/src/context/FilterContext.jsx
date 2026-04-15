import { createContext, useState, useContext } from 'react';

const FilterContext = createContext(null);

const defaultFilters = {
  date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  date_to: new Date().toISOString().split('T')[0],
  industry_id: '',
  client_id: '',
  status: '',
  objective: ''
};

export function FilterProvider({ children }) {
  const [filters, setFilters] = useState(defaultFilters);

  function updateFilter(key, value) {
    setFilters(prev => ({ ...prev, [key]: value }));
  }

  function resetFilters() {
    setFilters(defaultFilters);
  }

  function toQueryParams() {
    const params = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v) params[k] = v;
    }
    return params;
  }

  return (
    <FilterContext.Provider value={{ filters, updateFilter, resetFilters, toQueryParams }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be inside FilterProvider');
  return ctx;
}
