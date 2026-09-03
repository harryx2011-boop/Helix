import {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Calculator,
  Code2,
  FileText,
  HeartHandshake,
  Mail,
  Megaphone,
  MessageCircle,
  Mic,
  Shield,
  Terminal,
  Users,
  type LucideIcon,
} from 'lucide-react';

/** Icon names the catalog uses (roles.json, guide tabs) → lucide components. Everything visual is lucide; no company marks. */
const ICONS: Record<string, LucideIcon> = {
  BadgeDollarSign,
  BarChart3,
  Boxes,
  Calculator,
  Code2,
  FileText,
  HeartHandshake,
  Mail,
  Megaphone,
  MessageCircle,
  Mic,
  Shield,
  Terminal,
  Users,
};

export function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? FileText;
}

export const PLATFORM_ICONS: Record<string, LucideIcon> = {
  chat: MessageCircle,
  email: Mail,
  code: Terminal,
  voice: Mic,
  sql: BarChart3,
  python: Code2,
  docs: FileText,
};
