import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { clearStoredToken, getStoredToken } from '@/lib/auth-storage';

export function ProtectedLayout() {
  const location = useLocation();
  const token = getStoredToken();

  if (!token) {
    const next = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(next || '/admin')}`}
        replace
      />
    );
  }

  function logout() {
    clearStoredToken();
    window.location.assign('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)] bg-[var(--card)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link to="/admin" className="font-semibold text-[var(--foreground)]">
            Church Manager
          </Link>
          <nav className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/financeiro/cotas">Cotas</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/configuracoes/financeiro">Financeiro</Link>
            </Button>
            <Button variant="outline" size="sm" type="button" onClick={logout}>
              Sair
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl">
        <Outlet />
      </main>
    </div>
  );
}
