import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";

export type ShellNavItem = {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  active: boolean;
  onSelect: () => void;
  badge?: string | number;
};

export type ShellSubItem = { key: string; label: string; icon: ComponentType<{ size?: number }>; active: boolean; onSelect: () => void };

const COLLAPSE_KEY = "rj_sidebar_collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Fixed left navigation. Replaces the old two-line floating header so pages
 * get the full height and nothing sticky covers their content.
 */
export function AppSidebar({ items, subItemsFor, subItems, userName, syncSlot, onSwitchUser, onOpenSearch }: {
  items: ShellNavItem[];
  subItemsFor?: string;
  subItems?: ShellSubItem[];
  userName: string;
  syncSlot: ReactNode;
  onSwitchUser: () => void;
  onOpenSearch: () => void;
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* preference only */
    }
    document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded";
  }, [collapsed]);

  return (
    <aside className={`rj-sidebar ${collapsed ? "is-collapsed" : ""}`} aria-label="Navegação principal">
      <div className="rj-sidebar-brand">
        <img src="/brand/ramos-jornadas-icon-v3.png" alt="" />
        <strong>Ramos Jornadas</strong>
        <button className="rj-icon-button" type="button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expandir menu" : "Recolher menu"} aria-label={collapsed ? "Expandir menu" : "Recolher menu"}>
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <button className="rj-search-trigger" type="button" onClick={onOpenSearch} title="Buscar (Ctrl+K)">
        <Search size={16} />
        <span>Buscar…</span>
        <kbd>Ctrl K</kbd>
      </button>

      <nav className="rj-nav">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.key} className="rj-nav-group">
              <button className={`rj-nav-item ${item.active ? "is-active" : ""}`} type="button" onClick={item.onSelect} title={item.label} aria-current={item.active ? "page" : undefined}>
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge !== "" && <em>{item.badge}</em>}
              </button>
              {!collapsed && subItemsFor === item.key && subItems && subItems.length > 0 && (
                <div className="rj-subnav">
                  {subItems.map((sub) => {
                    const SubIcon = sub.icon;
                    return (
                      <button key={sub.key} className={`rj-subnav-item ${sub.active ? "is-active" : ""}`} type="button" onClick={sub.onSelect}>
                        <SubIcon size={15} />
                        <span>{sub.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="rj-sidebar-user">
        <span className="rj-avatar" aria-hidden="true">{userName.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong>{userName}</strong>
          <button type="button" onClick={onSwitchUser}>Trocar usuário</button>
        </div>
        <div className="rj-sync">{syncSlot}</div>
      </div>
    </aside>
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
