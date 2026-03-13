import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function DashboardLayout() {
  const { user, signOut } = useAuth();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <nav style={{ width: 220, background: '#1e3a5f', color: '#fff', padding: '1.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <h2 style={{ margin: '0 0 1.5rem', fontSize: '1.1rem' }}>⛪ ChurchManager</h2>
        <Link to="/" style={{ color: '#93c5fd', textDecoration: 'none' }}>🏠 Dashboard</Link>
        <Link to="/events" style={{ color: '#93c5fd', textDecoration: 'none' }}>📅 Eventos</Link>
        <Link to="/site-sections" style={{ color: '#93c5fd', textDecoration: 'none' }}>🖊️ Seções do Site</Link>
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid #2d5a8e', fontSize: '0.85rem', color: '#94a3b8' }}>
          <p style={{ margin: '0 0 0.5rem', wordBreak: 'break-all' }}>{user?.email}</p>
          <button
            onClick={() => signOut()}
            style={{ background: 'none', border: '1px solid #64748b', color: '#94a3b8', cursor: 'pointer', borderRadius: 4, padding: '0.25rem 0.5rem' }}
          >
            Sair
          </button>
        </div>
      </nav>
      <main style={{ flexGrow: 1, padding: '2rem' }}>
        <Outlet />
      </main>
    </div>
  );
}
