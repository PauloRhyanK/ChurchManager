import { useAuth } from '../context/AuthContext';

export default function DashboardHome() {
  const { user } = useAuth();

  return (
    <div>
      <h2>Bem-vindo, {user?.email}!</h2>
      <p>Use o menu lateral para gerenciar eventos e seções do site da sua igreja.</p>
      <ul style={{ lineHeight: 2 }}>
        <li>📅 <strong>Eventos</strong> — Crie, edite e remova eventos do calendário.</li>
        <li>🖊️ <strong>Seções do Site</strong> — Altere textos e imagens do site público sem modificar o código.</li>
      </ul>
    </div>
  );
}
