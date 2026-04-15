import { NavLink } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '~' },
  { to: '/industries', label: 'Industries', icon: '#' },
  { to: '/clients', label: 'Clients', icon: '@' },
  { to: '/gallery', label: 'Gallery', icon: '*' },
  { to: '/intelligence', label: 'Intelligence', icon: 'AI' },
  { to: '/query', label: 'Query', icon: '>' },
  { to: '/sync', label: 'Sync', icon: '%' },
  { to: '/settings', label: 'Settings', icon: '+' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-200 bg-gray-50">
      <div className="border-b px-4 py-4">
        <h1 className="text-lg font-bold text-gray-900">Ads Manager</h1>
        <p className="text-xs text-gray-500">Intelligence Platform</p>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <span className="w-4 text-center text-xs">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-3">
        <p className="truncate text-sm font-medium text-gray-700">{user?.name || user?.email}</p>
        <p className="text-xs text-gray-400">{user?.role}</p>
        <button
          onClick={logout}
          className="mt-2 w-full rounded bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-300"
        >
          Logout
        </button>
      </div>
    </aside>
  );
}
