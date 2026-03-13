import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { ReactNode } from 'react';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) return <p style={{ padding: '2rem' }}>Carregando…</p>;
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
