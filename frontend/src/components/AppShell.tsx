import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function AppShell() {
  const { user, logout, isProviderVerified } = useAuth()
  const links = [
    { to: '/dashboard', label: 'Dashboard', show: true },
    { to: '/medications', label: 'Medications', show: user?.role !== 'admin' && user?.role !== 'provider' },
    { to: '/schedule', label: 'Schedule', show: user?.role !== 'admin' && user?.role !== 'provider' },
    { to: '/provider/patients', label: 'My Patients', show: user?.role === 'provider' && isProviderVerified },
    { to: '/settings', label: user?.role === 'admin' ? 'Admin' : 'Settings', show: true },
  ].filter((link) => link.show)

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <div className="border-b border-slate-200 px-6 py-6">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-brand-600">Medication Manager</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Care Dashboard</h1>
          </div>

          <nav className="flex-1 px-4 py-6">
            <div className="space-y-2">
              {links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    `block rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {link.label}
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="border-t border-slate-200 px-6 py-5">
            <p className="text-sm font-medium text-slate-900">{user?.name}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
            <button
              onClick={logout}
              className="mt-4 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              Log out
            </button>
          </div>
        </aside>

        <div className="flex-1">
          <header className="border-b border-slate-200 bg-white px-5 py-4 lg:px-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Welcome back</p>
                <h2 className="text-xl font-semibold text-slate-900">{user?.name}</h2>
              </div>
              <div className="rounded-full bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700">
                {user?.role === 'provider'
                  ? `Provider ${user.provider_verification_status ?? 'pending'}`
                  : user?.role === 'admin'
                    ? 'Administrator'
                    : `Notifications ${user?.notifications_enabled ? 'On' : 'Off'}`}
              </div>
            </div>
          </header>

          <main className="px-5 py-6 lg:px-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
