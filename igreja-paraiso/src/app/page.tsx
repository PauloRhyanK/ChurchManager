import { getTenantBySlug, getUpcomingEvents, getSiteSection } from "@/lib/data";

// ISR: revalidate the page every 60 seconds
export const revalidate = 60;

const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG ?? "igreja-paraiso";

export default async function Home() {
  const tenant = await getTenantBySlug(TENANT_SLUG);

  if (!tenant) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-zinc-500">Igreja não encontrada.</p>
      </main>
    );
  }

  const [events, heroSection, aboutSection] = await Promise.all([
    getUpcomingEvents(tenant.id),
    getSiteSection(tenant.id, "hero_section"),
    getSiteSection(tenant.id, "about_us"),
  ]);

  const hero = heroSection?.content as { title?: string; subtitle?: string; cta_text?: string } | undefined;
  const about = aboutSection?.content as { title?: string; text?: string } | undefined;

  return (
    <div className="min-h-screen bg-white font-sans text-zinc-900">
      {/* Hero Section */}
      <section className="bg-blue-900 text-white py-24 px-6 text-center">
        <h1 className="text-4xl font-bold mb-4">
          {hero?.title ?? tenant.name}
        </h1>
        {hero?.subtitle && (
          <p className="text-xl text-blue-200 mb-8">{hero.subtitle}</p>
        )}
        {hero?.cta_text && (
          <a
            href="#events"
            className="inline-block bg-white text-blue-900 font-semibold px-6 py-3 rounded-full hover:bg-blue-50 transition-colors"
          >
            {hero.cta_text}
          </a>
        )}
      </section>

      {/* About Section */}
      {about && (
        <section className="max-w-3xl mx-auto py-16 px-6">
          <h2 className="text-2xl font-bold mb-4">{about.title}</h2>
          <p className="text-zinc-600 leading-relaxed">{String(about.text ?? "")}</p>
        </section>
      )}

      {/* Events Section */}
      <section id="events" className="max-w-3xl mx-auto py-16 px-6">
        <h2 className="text-2xl font-bold mb-8">Próximos Eventos</h2>
        {events.length === 0 ? (
          <p className="text-zinc-500">Nenhum evento agendado no momento.</p>
        ) : (
          <ul className="space-y-6">
            {events.map((event) => (
              <li
                key={event.id}
                className="border border-zinc-200 rounded-lg p-6 hover:shadow-md transition-shadow"
              >
                {event.banner_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={event.banner_url}
                    alt={event.title}
                    className="w-full h-48 object-cover rounded mb-4"
                  />
                )}
                <h3 className="text-xl font-semibold mb-1">{event.title}</h3>
                <p className="text-sm text-blue-600 mb-2">
                  {new Date(event.date).toLocaleString("pt-BR", {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </p>
                {event.description && (
                  <p className="text-zinc-600 text-sm">{event.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-200 py-8 text-center text-zinc-400 text-sm">
        © {new Date().getFullYear()} {tenant.name}. Todos os direitos reservados.
      </footer>
    </div>
  );
}
