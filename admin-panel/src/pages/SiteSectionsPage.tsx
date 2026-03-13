import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

interface SiteSection {
  id: string;
  section_key: string;
  content: Record<string, unknown>;
}

export default function SiteSectionsPage() {
  const [sections, setSections] = useState<SiteSection[]>([]);
  const [editingSection, setEditingSection] = useState<SiteSection | null>(null);
  const [contentText, setContentText] = useState('');
  const [newKey, setNewKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('site_sections')
      .select('id, section_key, content')
      .order('section_key')
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) setError(fetchError.message);
        else setSections(data ?? []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [refresh]);

  const triggerRefresh = () => setRefresh((n) => n + 1);

  const startEdit = (section: SiteSection) => {
    setEditingSection(section);
    setContentText(JSON.stringify(section.content, null, 2));
    setJsonError(null);
  };

  const cancelEdit = () => {
    setEditingSection(null);
    setContentText('');
    setJsonError(null);
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(contentText);
    } catch {
      setJsonError('JSON inválido. Verifique a sintaxe.');
      return;
    }
    if (!editingSection) return;
    const { error: updateError } = await supabase
      .from('site_sections')
      .update({ content: parsed })
      .eq('id', editingSection.id);
    if (updateError) { setError(updateError.message); return; }
    cancelEdit();
    triggerRefresh();
  };

  const createSection = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newKey.trim()) return;
    const { error: insertError } = await supabase
      .from('site_sections')
      .insert({ section_key: newKey.trim(), content: {} });
    if (insertError) { setError(insertError.message); return; }
    setNewKey('');
    triggerRefresh();
  };

  const deleteSection = async (id: string) => {
    if (!confirm('Excluir esta seção?')) return;
    const { error: delError } = await supabase.from('site_sections').delete().eq('id', id);
    if (delError) setError(delError.message);
    else triggerRefresh();
  };

  return (
    <div>
      <h2>Seções do Site</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={createSection} style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <input
          placeholder="Nova chave de seção (ex: hero_section)"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          required
          style={{ padding: '0.5rem', flexGrow: 1 }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Criar Seção
        </button>
      </form>

      {editingSection && (
        <form onSubmit={saveEdit} style={{ marginBottom: '2rem', border: '1px solid #e2e8f0', borderRadius: 8, padding: '1rem' }}>
          <h3 style={{ margin: '0 0 0.75rem' }}>Editar: <code>{editingSection.section_key}</code></h3>
          <textarea
            value={contentText}
            onChange={(e) => { setContentText(e.target.value); setJsonError(null); }}
            rows={10}
            style={{ width: '100%', padding: '0.5rem', fontFamily: 'monospace', boxSizing: 'border-box' }}
          />
          {jsonError && <p style={{ color: 'red', margin: '0.25rem 0' }}>{jsonError}</p>}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="submit" style={{ padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Salvar
            </button>
            <button type="button" onClick={cancelEdit} style={{ padding: '0.5rem 1rem' }}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p>Carregando…</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sections.map((s) => (
            <li key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 0', borderBottom: '1px solid #e2e8f0' }}>
              <code style={{ flexGrow: 1, fontWeight: 600 }}>{s.section_key}</code>
              <button onClick={() => startEdit(s)} style={{ cursor: 'pointer' }}>✏️ Editar</button>
              <button onClick={() => deleteSection(s.id)} style={{ cursor: 'pointer' }}>🗑️</button>
            </li>
          ))}
          {sections.length === 0 && (
            <li style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>Nenhuma seção encontrada.</li>
          )}
        </ul>
      )}
    </div>
  );
}
