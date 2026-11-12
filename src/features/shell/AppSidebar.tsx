import { useEffect, type ComponentType, type ReactNode } from "react";
import { Search } from "lucide-react";

export type ShellNavItem = {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  active: boolean;
  onSelect: () => void;
  badge?: string | number;
};

export type ShellSubItem = { key: string; label: string; icon: ComponentType<{ size?: number }>; active: boolean; onSelect: () => void };

/**
 * Single-line top navigation. Full width for the pages, nothing floating
 * over the content (it is sticky but takes its own space).
 */
export function AppSidebar({ items, userName, syncSlot, onSwitchUser, onOpenSearch }: {
  items: ShellNavItem[];
  subItemsFor?: string;
  subItems?: ShellSubItem[];
  userName: string;
  syncSlot: ReactNode;
  onSwitchUser: () => void;
  onOpenSearch: () => void;
}) {
  useEffect(() => { document.documentElement.dataset.sidebar = "top"; }, []);
  return (
    <header className="rj-topbar" aria-label="Navegação principal">
      <div className="rj-topbar-brand">
        <img src="/brand/ramos-jornadas-icon-v3.png" alt="" />
        <strong>Ramos Jornadas</strong>
      </div>
      <nav className="rj-topnav">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.key} className={`rj-topnav-item ${item.active ? "is-active" : ""}`} type="button" onClick={item.onSelect} title={item.label} aria-current={item.active ? "page" : undefined}>
              <Icon size={17} />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge !== "" && <em>{item.badge}</em>}
            </button>
          );
        })}
      </nav>
      <button className="rj-search-trigger" type="button" onClick={onOpenSearch} title="Buscar (Ctrl+K)">
        <Search size={16} />
        <span>Buscar…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="rj-topbar-user">
        <div className="rj-sync">{syncSlot}</div>
        <button className="rj-user-chip" type="button" onClick={onSwitchUser} title="Trocar usuário">
          <span className="rj-avatar is-small" aria-hidden="true">{userName.slice(0, 1).toUpperCase()}</span>
          <span><strong>{userName}</strong><small>Trocar usuário</small></span>
        </button>
      </div>
    </header>
  );
}

/** Standard page header: title, short subtitle, primary actions on the right. */
export function PageHeader({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="rj-page-header">
      <div className="rj-page-header-main">
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {actions && <div className="rj-page-header-actions">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
