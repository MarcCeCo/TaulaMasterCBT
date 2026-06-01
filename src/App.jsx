import { Routes, Route, NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, TrendingUp, Menu, X, LogOut, Landmark, PiggyBank, Bot } from 'lucide-react'
import { useState, lazy, Suspense } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Loader from './components/shared/Loader'

const Dashboard       = lazy(() => import('./pages/Dashboard'))
const Pressupost      = lazy(() => import('./pages/Pressupost'))
const Inversions      = lazy(() => import('./pages/Inversions'))
const ComptesBancaris = lazy(() => import('./pages/ComptesBancaris'))
const Guardioles      = lazy(() => import('./pages/Guardioles'))
const Assistent       = lazy(() => import('./pages/Assistent'))

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Resum' },
  { to: '/pressupost', icon: Wallet, label: 'Pressupost' },
  { to: '/guardioles', icon: PiggyBank, label: 'Guardioles' },
  { to: '/assistent', icon: Bot, label: 'Assistent IA' },
  { to: '/inversions', icon: TrendingUp, label: 'Inversions' },
  { to: '/comptes', icon: Landmark, label: 'Comptes Bancaris' },
]

export default function App() {
  const { session, loading } = useAuth()
  const [open, setOpen] = useState(false)

  if (loading) return <Loader />
  if (!session) return <Login />

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-56 transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}
        style={{ background: 'var(--ink-900)', borderRight: '1px solid var(--ink-700)' }}
      >
        <div className="px-6 py-7 flex items-center gap-3">
          <span style={{ fontFamily: '"DM Serif Display", serif', fontSize: '1.5rem', color: 'var(--gold)' }}>
            Comptes
          </span>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`
              }
              style={({ isActive }) => isActive ? { background: 'var(--ink-700)', color: 'var(--gold-light)' } : {}}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 py-4 space-y-2" style={{ borderTop: '1px solid var(--ink-700)' }}>
          <p className="px-3 text-xs text-gray-600 truncate">{session.user.email}</p>
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-white/5 w-full transition-colors"
          >
            <LogOut size={16} /> Tancar sessió
          </button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={() => setOpen(false)} />
      )}

      <div className="flex-1 flex flex-col md:ml-56">
        <header className="flex items-center gap-4 px-4 py-4 md:hidden"
          style={{ borderBottom: '1px solid var(--ink-700)', background: 'var(--ink-900)' }}>
          <button onClick={() => setOpen(!open)} className="text-gray-400 hover:text-white">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
          <span style={{ fontFamily: '"DM Serif Display", serif', color: 'var(--gold)' }}>Comptes</span>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto">
          <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pressupost" element={<Pressupost />} />
            <Route path="/assistent" element={<Assistent />} />
            <Route path="/guardioles" element={<Guardioles />} />
            <Route path="/inversions" element={<Inversions />} />
            <Route path="/comptes" element={<ComptesBancaris />} />
          </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
