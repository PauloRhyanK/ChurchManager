import {
  Baby,
  BookOpen,
  Calendar,
  Church,
  Circle,
  Flame,
  Globe,
  HandHeart,
  Heart,
  Mail,
  MapPin,
  Music,
  Phone,
  Sparkles,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Espelha `SITE_ICONS` da API. Mapa explícito em vez de `import * as lucide`
 * para não arrastar o pacote inteiro para o bundle.
 */
const ICONS: Record<string, LucideIcon> = {
  Heart,
  Users,
  BookOpen,
  MapPin,
  Music,
  Church,
  Calendar,
  Star,
  Sparkles,
  HandHeart,
  Baby,
  Flame,
  Globe,
  Phone,
  Mail,
};

/** Ícone genérico quando a API conhece um nome que este mapa ainda não tem. */
export function getSiteIcon(name: string | undefined): LucideIcon {
  return (name && ICONS[name]) || Circle;
}
