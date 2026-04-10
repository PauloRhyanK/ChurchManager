import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { CotasPage } from '@/features/financial/pages/CotasPage';
import { FinancialSettingsPage } from '@/features/financial/pages/FinancialSettingsPage';
import { ProtectedLayout } from './ProtectedLayout';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/admin',
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="financeiro/cotas" replace /> },
      {
        path: 'configuracoes/financeiro',
        element: <FinancialSettingsPage />,
      },
      { path: 'financeiro/cotas', element: <CotasPage /> },
    ],
  },
  { path: '/', element: <Navigate to="/admin" replace /> },
  { path: '*', element: <Navigate to="/admin" replace /> },
]);
