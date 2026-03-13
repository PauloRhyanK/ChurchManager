import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface Event {
  id: string;
  title: string;
  date: string;
  description: string | null;
  banner_url: string | null;
  is_active: boolean;
}

const emptyForm = { title: '', date: '', description: '', banner_url: '', is_active: true };

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('events')
      .select('*')
      .order('date', { ascending: true })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) setError(fetchError.message);
        else setEvents(data ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refresh]);

  const triggerRefresh = () => setRefresh((n) => n + 1);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = {
      title: form.title,
      date: form.date,
      description: form.description || null,
      banner_url: form.banner_url || null,
      is_active: form.is_active,
    };
    let err;
    if (editingId) {
      ({ error: err } = await supabase.from('events').update(payload).eq('id', editingId));
    } else {
      ({ error: err } = await supabase.from('events').insert(payload));
    }
    if (err) { setError(err.message); return; }
    setForm(emptyForm);
    setEditingId(null);
    triggerRefresh();
  };

  const startEdit = (event: Event) => {
    setEditingId(event.id);
    setForm({
      title: event.title,
      date: event.date.slice(0, 16),
      description: event.description ?? '',
      banner_url: event.banner_url ?? '',
      is_active: event.is_active,
    });
  };

  const deleteEvent = async (id: string) => {
    if (!confirm('Excluir este evento?')) return;
    const { error: delError } = await supabase.from('events').delete().eq('id', id);
    if (delError) setError(delError.message);
    else triggerRefresh();
  };

  return (
    <div>
      <h2>Eventos</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem', maxWidth: 520, marginBottom: '2rem' }}>
        <h3 style={{ margin: 0 }}>{editingId ? 'Editar Evento' : 'Novo Evento'}</h3>
        <input
          placeholder="Título *"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          required
          style={{ padding: '0.5rem' }}
        />
        <input
          type="datetime-local"
          value={form.date}
          onChange={(e) => setForm({ ...form, date: e.target.value })}
          required
          style={{ padding: '0.5rem' }}
        />
        <textarea
          placeholder="Descrição"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          style={{ padding: '0.5rem', resize: 'vertical' }}
        />
        <input
          placeholder="URL do banner"
          value={form.banner_url}
          onChange={(e) => setForm({ ...form, banner_url: e.target.value })}
          style={{ padding: '0.5rem' }}
        />
        <label>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          {' '}Ativo
        </label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="submit" style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
            {editingId ? 'Salvar' : 'Criar'}
          </button>
          {editingId && (
            <button type="button" onClick={() => { setForm(emptyForm); setEditingId(null); }} style={{ padding: '0.5rem 1rem' }}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      {loading ? (
        <p>Carregando…</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Título</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Data</th>
              <th style={{ textAlign: 'left', padding: '0.5rem' }}>Ativo</th>
              <th style={{ padding: '0.5rem' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {events.map((ev) => (
              <tr key={ev.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.5rem' }}>{ev.title}</td>
                <td style={{ padding: '0.5rem' }}>{new Date(ev.date).toLocaleString('pt-BR')}</td>
                <td style={{ padding: '0.5rem' }}>{ev.is_active ? '✅' : '❌'}</td>
                <td style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => startEdit(ev)} style={{ cursor: 'pointer' }}>✏️</button>
                  <button onClick={() => deleteEvent(ev.id)} style={{ cursor: 'pointer' }}>🗑️</button>
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>Nenhum evento encontrado.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
