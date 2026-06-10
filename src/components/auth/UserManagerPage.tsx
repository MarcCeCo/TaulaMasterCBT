// src/components/auth/UserManagerPage.tsx
import { useEffect, useState, useMemo } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import {
  useAuth,
  type UserPermissionLevel,
  type UserProfile,
  type AppView,
  type SectionRole,
  type SectionPermissions,
  ALL_VIEWS,
  VIEW_LABELS,
  VIEW_ICONS,
  VIEW_GROUPS,
  DEFAULT_SECTION_PERMISSIONS,
  FULL_SECTION_PERMISSIONS,
  parseSectionPermissions,
  parseUserPermissionLevel,
} from "@/lib/auth";
import {
  Pencil, Trash2, UserPlus, RefreshCw, Send, Check, X,
  Info, Users, Eye, EyeOff, Shield, ChevronDown, ChevronUp,
  Building2, Search, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<UserPermissionLevel, string> = {
  user:  "Usuari",
  admin: "Administrador",
};

const LEVEL_COLORS: Record<UserPermissionLevel, string> = {
  user:  "bg-slate-100 text-slate-600 border-slate-200",
  admin: "bg-violet-100 text-violet-700 border-violet-200",
};

const SECTION_ROLE_CONFIG: Record<SectionRole, { label: string; color: string; icon: React.ReactNode }> = {
  none:   { label: "Sense accés",   color: "bg-slate-100 text-slate-400 border-slate-200",       icon: <EyeOff className="h-3 w-3" /> },
  viewer: { label: "Visualitzador", color: "bg-emerald-50 text-emerald-700 border-emerald-200",  icon: <Eye className="h-3 w-3" /> },
  editor: { label: "Editor",        color: "bg-blue-50 text-blue-700 border-blue-200",           icon: <Pencil className="h-3 w-3" /> },
};

const NO_ORG_KEY = "__sense_organitzacio__";

function cycleSectionRole(current: SectionRole): SectionRole {
  if (current === "none")   return "viewer";
  if (current === "viewer") return "editor";
  return "none";
}

// ─── SectionRolePill ──────────────────────────────────────────────────────────

function SectionRolePill({
  role, onClick, disabled = false,
}: {
  role: SectionRole | "admin";
  onClick?: () => void;
  disabled?: boolean;
}) {
  if (role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border bg-violet-50 text-violet-700 border-violet-200">
        <Shield className="h-3 w-3" /> Admin
      </span>
    );
  }
  const cfg = SECTION_ROLE_CONFIG[role];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all",
        cfg.color,
        !disabled && "hover:opacity-80 cursor-pointer",
        disabled && "cursor-default opacity-70"
      )}
      title={disabled ? undefined : `Clic per canviar (${cfg.label})`}
    >
      {cfg.icon} {cfg.label}
    </button>
  );
}

// ─── PermissionsMatrix ────────────────────────────────────────────────────────

function PermissionsMatrix({
  permissions, isAdmin, onChange,
}: {
  permissions: SectionPermissions;
  isAdmin: boolean;
  onChange: (next: SectionPermissions) => void;
}) {
  const setAll = (role: SectionRole) => {
    const next = { ...permissions };
    ALL_VIEWS.forEach((v) => { next[v] = role; });
    onChange(next);
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400 self-center mr-1">Assignar tot:</span>
          {(["none", "viewer", "editor"] as SectionRole[]).map((r) => {
            const cfg = SECTION_ROLE_CONFIG[r];
            return (
              <button key={r} type="button" onClick={() => setAll(r)}
                className={cn("text-[11px] px-2 py-0.5 rounded border transition-colors", cfg.color, "hover:opacity-80")}>
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {VIEW_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{group.label}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {group.views.map((view) => {
              const current = isAdmin ? "admin" : (permissions[view] ?? "none");
              return (
                <div key={view} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-xs text-slate-600 flex items-center gap-1.5">
                    <span>{VIEW_ICONS[view]}</span>
                    {VIEW_LABELS[view]}
                  </span>
                  <SectionRolePill
                    role={current}
                    disabled={isAdmin}
                    onClick={() => {
                      const next = { ...permissions };
                      next[view] = cycleSectionRole(permissions[view] ?? "none");
                      onChange(next);
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {isAdmin && (
        <p className="text-[11px] text-slate-400 italic">Els administradors tenen accés complet a totes les seccions.</p>
      )}
    </div>
  );
}

// ─── PermissionsSummaryPills ──────────────────────────────────────────────────

function PermissionsSummaryPills({ profile }: { profile: UserProfile }) {
  if (profile.role === "admin") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-violet-600 italic">
        <Shield className="h-3 w-3" /> Accés complet
      </span>
    );
  }
  const perms = profile.section_permissions;
  if (!perms) return <span className="text-[11px] text-slate-400 italic">Accés complet</span>;

  const editors   = ALL_VIEWS.filter((v) => perms[v] === "editor");
  const viewers   = ALL_VIEWS.filter((v) => perms[v] === "viewer");
  const noneCount = ALL_VIEWS.filter((v) => perms[v] === "none").length;

  if (noneCount === ALL_VIEWS.length) {
    return <span className="text-[11px] text-slate-400 italic">Sense accés a cap secció</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {editors.map((v) => (
        <span key={v} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-100">
          <Pencil className="h-2.5 w-2.5" /> {VIEW_LABELS[v]}
        </span>
      ))}
      {viewers.map((v) => (
        <span key={v} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100">
          <Eye className="h-2.5 w-2.5" /> {VIEW_LABELS[v]}
        </span>
      ))}
    </div>
  );
}

// ─── Component principal ──────────────────────────────────────────────────────

export function UserManagerPage() {
  const { profile: myProfile, getToken } = useAuth();
  const [users, setUsers]     = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch]   = useState("");

  // Formulari nou usuari
  const [email, setEmail]           = useState("");
  const [fullName, setFullName]     = useState("");
  const [organisation, setOrg]      = useState("");
  const [level, setLevel]           = useState<UserPermissionLevel>("user");
  const [newPerms, setNewPerms]     = useState<SectionPermissions>({ ...DEFAULT_SECTION_PERMISSIONS });
  const [submitting, setSubmitting] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);

  // Edició usuari existent
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editLevel, setEditLevel]     = useState<UserPermissionLevel>("user");
  const [editPerms, setEditPerms]     = useState<SectionPermissions>({ ...DEFAULT_SECTION_PERMISSIONS });
  const [editOrg, setEditOrg]         = useState("");
  const [editFullName, setEditFullName] = useState("");

  // ── Càrrega ───────────────────────────────────────────────────────────────

  const fetchUsers = async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      let usedApi = false;
      try {
        const res = await fetch("/api/list-users", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const json = await res.json();
          const raw: UserProfile[] = (json.users ?? []).map((u: any) => ({
            ...u,
            role: parseUserPermissionLevel(u.role),
            section_permissions: parseSectionPermissions(u.allowed_views ?? u.section_permissions),
            organisation: u.organisation ?? null,
          }));
          setUsers(raw);
          usedApi = true;
        } else {
          const json = await res.json().catch(() => ({}));
          toast.error(`Error de l'API: ${json.error ?? res.statusText}`);
        }
      } catch (apiErr: any) {
        console.warn("API /list-users no disponible, fallback a Supabase directe:", apiErr.message);
      }
      if (!usedApi) {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("id, email, full_name, role, allowed_views, organisation")
          .order("organisation", { nullsFirst: true })
          .order("email");
        if (!error && data) {
          setUsers(data.map((u: any) => ({
            ...u,
            email:               u.email ?? "",
            role:                parseUserPermissionLevel(u.role),
            section_permissions: parseSectionPermissions(u.allowed_views),
            organisation:        u.organisation ?? null,
          })));
        } else {
          toast.error(`Error carregant usuaris: ${error?.message ?? "error desconegut"}`);
        }
      }
    } catch {
      toast.error("Error carregant usuaris");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (myProfile) fetchUsers();
  }, [myProfile]);

  // ── Invitar ───────────────────────────────────────────────────────────────

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error("El correu és obligatori");
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch("/api/create-user", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email:         email.trim(),
          full_name:     fullName.trim(),
          role:          level,
          organisation:  organisation.trim() || null,
          allowed_views: level === "admin" ? null : newPerms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error convidant usuari");
      toast.success(`Invitació enviada a ${email}`);
      setEmail(""); setFullName(""); setOrg(""); setLevel("user");
      setNewPerms({ ...DEFAULT_SECTION_PERMISSIONS });
      setShowInviteForm(false);
      await fetchUsers();
    } catch (err: any) {
      if (err.name === "AbortError" || err.name === "TimeoutError") {
        toast.error("La invitació ha trigat massa. Comprova la configuració SMTP de Supabase.");
      } else {
        toast.error(err.message ?? "Error desconegut");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Editar ────────────────────────────────────────────────────────────────

  const startEditing = (u: UserProfile) => {
    setEditingId(u.id);
    setEditLevel(u.role);
    setEditPerms(u.section_permissions ?? { ...FULL_SECTION_PERMISSIONS });
    setEditOrg(u.organisation ?? "");
    setEditFullName(u.full_name ?? "");
    setExpanded(u.id);
  };

  const handleUpdateUser = async (userId: string) => {
    try {
      const token = getToken();
      const res = await fetch("/api/update-user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id:       userId,
          role:          editLevel,
          full_name:     editFullName.trim() || null,
          organisation:  editOrg.trim() || null,
          allowed_views: editLevel === "admin" ? null : editPerms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error actualitzant usuari");
      toast.success("Usuari actualitzat");
      setEditingId(null);
      setExpanded(null);
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message ?? "Error actualitzant usuari");
    }
  };

  // ── Eliminar ──────────────────────────────────────────────────────────────

  const handleDelete = async (userId: string, userEmail: string) => {
    try {
      const token = getToken();
      const res = await fetch("/api/delete-user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id: userId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error eliminant usuari");
      toast.success(`${userEmail} eliminat correctament`);
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message ?? "Error eliminant usuari");
    }
  };

  // ── Agrupació per organització ────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      (u.full_name ?? "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.organisation ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  const groupedUsers = useMemo(() => {
    const map = new Map<string, UserProfile[]>();
    for (const u of filteredUsers) {
      const key = u.organisation?.trim() || NO_ORG_KEY;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(u);
    }
    // Ordenem: organitzacions amb nom primer (alfab.), sense organització al final
    const entries = [...map.entries()].sort(([a], [b]) => {
      if (a === NO_ORG_KEY) return 1;
      if (b === NO_ORG_KEY) return -1;
      return a.localeCompare(b, "ca");
    });
    return entries;
  }, [filteredUsers]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 w-full">

      {/* ── Capçalera ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-[#0099A8]" />
            Gestió d'usuaris
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {users.length} usuari{users.length !== 1 ? "s" : ""} · agrupats per organització
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchUsers} disabled={loading} className="gap-1.5 text-xs text-slate-500">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualitza
          </Button>
          <Button
            size="sm"
            className="bg-[#0099A8] hover:bg-[#006E7A] gap-1.5"
            onClick={() => setShowInviteForm(v => !v)}
          >
            <UserPlus className="h-4 w-4" />
            {showInviteForm ? "Tancar formulari" : "Convidar usuari"}
          </Button>
        </div>
      </div>

      {/* ── Formulari invitació (desplegable) ─────────────────────────── */}
      {showInviteForm && (
        <div className="rounded-xl border border-[#0099A8]/20 bg-[#0099A8]/3 p-5 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="h-7 w-7 rounded-lg bg-[#0099A8]/10 flex items-center justify-center">
              <UserPlus className="h-4 w-4 text-[#0099A8]" />
            </div>
            <p className="text-sm font-semibold text-[#006E7A]">Convidar nou usuari</p>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-[#0099A8]/8 border border-[#0099A8]/15 text-xs text-[#006E7A]">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            L'usuari rebrà un correu d'invitació per establir la seva pròpia contrasenya.
          </div>

          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Correu electrònic *</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuari@example.com" required className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Nom complet</label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nom i cognoms" className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Organització
                </label>
                <Input value={organisation} onChange={(e) => setOrg(e.target.value)}
                  placeholder="Nom de l'empresa o dept." className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Tipus d'accés</label>
                <Select value={level} onValueChange={(v) => setLevel(v as UserPermissionLevel)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Usuari (permisos per finestra)</SelectItem>
                    <SelectItem value="admin">Administrador (accés complet)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-4 bg-white/60">
              <p className="text-xs font-semibold text-slate-600 mb-3">Permisos per finestra</p>
              <PermissionsMatrix permissions={newPerms} isAdmin={level === "admin"} onChange={setNewPerms} />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowInviteForm(false)}>
                Cancel·la
              </Button>
              <Button type="submit" disabled={submitting} className="bg-[#0099A8] hover:bg-[#006E7A] gap-1.5">
                <Send className="h-4 w-4" />
                {submitting ? "Enviant invitació…" : "Envia invitació"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ── Cerca ─────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca per nom, correu o organització…"
          className="pl-9 h-9 bg-white border-slate-200"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Taula principal ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm w-full overflow-auto max-h-[calc(100vh-220px)]">

        {/* Capçalera de la taula */}
        <div className="sticky top-0 z-10 grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-0 border-b border-slate-200 bg-slate-50 px-4 py-2.5 shadow-sm">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Usuari</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Correu</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1">
            <Building2 className="h-3 w-3" /> Organització
          </span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Rol</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide text-right pr-1">Accions</span>
        </div>

        {/* Grups per organització */}
        {groupedUsers.length === 0 && !loading && (
          <div className="px-5 py-14 text-center text-slate-400 text-sm">
            {search ? "Cap usuari coincideix amb la cerca" : "Cap usuari trobat"}
          </div>
        )}

        {loading && (
          <div className="px-5 py-14 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4 animate-spin" /> Carregant usuaris…
          </div>
        )}

        {!loading && groupedUsers.map(([orgKey, orgUsers]) => {
          const isNoOrg = orgKey === NO_ORG_KEY;
          return (
            <div key={orgKey}>
              {/* Capçalera de grup */}
              <div className={cn(
                "flex items-center gap-2 px-4 py-2 border-b border-t border-slate-100",
                isNoOrg ? "bg-slate-50/50" : "bg-[#0099A8]/4"
              )}>
                <Building2 className={cn("h-3.5 w-3.5", isNoOrg ? "text-slate-400" : "text-[#0099A8]")} />
                <span className={cn(
                  "text-xs font-semibold",
                  isNoOrg ? "text-slate-400 italic" : "text-[#006E7A]"
                )}>
                  {isNoOrg ? "Sense organització" : orgKey}
                </span>
                <span className="ml-1 text-[10px] text-slate-400">
                  ({orgUsers.length} usuari{orgUsers.length !== 1 ? "s" : ""})
                </span>
              </div>

              {/* Files d'usuaris */}
              {orgUsers.map((u) => {
                const isMe      = u.id === myProfile?.id;
                const isEditing = editingId === u.id;
                const isOpen    = expanded === u.id;

                return (
                  <div key={u.id} className={cn(
                    "border-b border-slate-100 last:border-b-0 transition-colors",
                    isMe && "bg-[#0099A8]/3",
                    isEditing && "bg-blue-50/30",
                    !isMe && !isEditing && "hover:bg-slate-50/70"
                  )}>
                    {/* Fila principal */}
                    <div className="grid grid-cols-[2fr_2fr_1.5fr_1fr_auto] gap-0 items-center px-4 py-3">

                      {/* Columna: Nom */}
                      <div className="flex items-center gap-2.5 min-w-0 pr-3">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center shrink-0 text-xs font-bold text-slate-600 border border-slate-200">
                          {((u.full_name || u.email || "?")[0]).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-slate-700 truncate">
                              {u.full_name || <span className="text-slate-400 italic">Sense nom</span>}
                            </span>
                            {isMe && (
                              <Badge className="text-[9px] px-1 py-0 bg-[#0099A8] text-white border-0 h-4">Jo</Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Columna: Correu */}
                      <div className="min-w-0 pr-3">
                        <p className="text-xs text-slate-500 font-mono truncate">{u.email}</p>
                      </div>

                      {/* Columna: Organització */}
                      <div className="min-w-0 pr-3">
                        {u.organisation ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[#006E7A] bg-[#0099A8]/8 border border-[#0099A8]/15 px-2 py-0.5 rounded-full truncate max-w-full">
                            <Building2 className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{u.organisation}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-300 italic">—</span>
                        )}
                      </div>

                      {/* Columna: Rol global */}
                      <div className="pr-3">
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border",
                          LEVEL_COLORS[u.role]
                        )}>
                          {u.role === "admin" && <Shield className="h-2.5 w-2.5" />}
                          {LEVEL_LABELS[u.role]}
                        </span>
                      </div>

                      {/* Columna: Accions */}
                      <div className="flex items-center gap-0.5 justify-end shrink-0">
                        {/* Editar: disponible per a tots els usuaris, inclòs un mateix */}
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-slate-700"
                          onClick={() => {
                            if (isEditing) { setEditingId(null); setExpanded(null); }
                            else startEditing(u);
                          }}
                          title={isEditing ? "Cancel·la edició" : "Edita"}
                        >
                          {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </Button>
                        {/* Eliminar: no disponible per a un mateix — placeholder per mantenir alineació */}
                        {isMe ? (
                          <div className="h-7 w-7 shrink-0" />
                        ) : (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-600" title="Elimina">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Eliminar usuari?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  S'eliminarà <strong>{u.email}</strong> de forma permanent.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive hover:bg-destructive/90"
                                  onClick={() => handleDelete(u.id, u.email)}
                                >
                                  Elimina
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                        <button
                          className="h-7 flex items-center gap-1 px-2 text-slate-400 hover:text-[#0099A8] hover:bg-[#0099A8]/8 rounded transition-colors text-[11px] font-medium"
                          onClick={() => setExpanded(isOpen && !isEditing ? null : u.id)}
                          title={isOpen ? "Amaga detalls" : "Veure permisos"}
                        >
                          {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          <span className="hidden sm:inline">{isOpen ? "Amaga" : "Permisos"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Panell expandible */}
                    {isOpen && (
                      <div className="px-4 pb-5 pt-2 border-t border-slate-100 bg-slate-50/50">
                        {isEditing ? (
                          <div className="space-y-4 max-w-2xl">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-600">Nom complet</label>
                                <Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)}
                                  placeholder="Nom i cognoms" className="h-8 text-xs" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                                  <Building2 className="h-3 w-3" /> Organització
                                </label>
                                <Input value={editOrg} onChange={(e) => setEditOrg(e.target.value)}
                                  placeholder="Empresa o departament" className="h-8 text-xs" />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-600">Tipus d'accés</label>
                                {isMe ? (
                                  <div className="h-8 flex items-center px-2 rounded-md border border-slate-200 bg-slate-50 text-xs text-slate-500 gap-1.5">
                                    <Lock className="h-3 w-3 shrink-0" />
                                    {editLevel === "admin" ? "Administrador (accés complet)" : "Usuari (permisos per finestra)"}
                                  </div>
                                ) : (
                                  <Select value={editLevel} onValueChange={(v) => setEditLevel(v as UserPermissionLevel)}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="user">Usuari (permisos per finestra)</SelectItem>
                                      <SelectItem value="admin">Administrador (accés complet)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              </div>
                            </div>

                            <PermissionsMatrix
                              permissions={editPerms}
                              isAdmin={editLevel === "admin"}
                              onChange={setEditPerms}
                            />

                            <div className="flex gap-2 pt-1">
                              <Button size="sm" className="bg-[#0099A8] hover:bg-[#006E7A] gap-1" onClick={() => handleUpdateUser(u.id)}>
                                <Check className="h-3.5 w-3.5" /> Desa canvis
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1"
                                onClick={() => { setEditingId(null); setExpanded(null); }}>
                                <X className="h-3.5 w-3.5" /> Cancel·la
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="pt-1 max-w-2xl">
                            <PermissionsMatrix
                              permissions={u.section_permissions ?? { equips: "editor", gubimclass: "editor", fields: "editor", revit: "editor", projectes: "editor", rosmiman: "editor", visor3d: "editor" }}
                              isAdmin={u.role === "admin"}
                              onChange={() => {}}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* SQL migration hint */}
      <p className="text-[10px] text-slate-300 text-center">
        Columna <code>organisation TEXT</code> necessària a la taula <code>user_profiles</code> de Supabase
      </p>
    </div>
  );
}
