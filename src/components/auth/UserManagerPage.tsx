// src/components/auth/UserManagerPage.tsx
import { useEffect, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const LEVEL_LABELS: Record<UserPermissionLevel, string> = {
  user:  "Usuari",
  admin: "Administrador",
};

const LEVEL_COLORS: Record<UserPermissionLevel, string> = {
  user:  "bg-slate-100 text-slate-600",
  admin: "bg-violet-100 text-violet-700",
};

const SECTION_ROLE_CONFIG: Record<SectionRole, { label: string; color: string; icon: React.ReactNode }> = {
  none:   { label: "Sense accés",  color: "bg-slate-100 text-slate-400 border-slate-200",        icon: <EyeOff className="h-3 w-3" /> },
  viewer: { label: "Visualitzador", color: "bg-emerald-50 text-emerald-700 border-emerald-200",  icon: <Eye className="h-3 w-3" /> },
  editor: { label: "Editor",        color: "bg-blue-50 text-blue-700 border-blue-200",            icon: <Pencil className="h-3 w-3" /> },
};

// Cicle: none → viewer → editor → none
function cycleSectionRole(current: SectionRole): SectionRole {
  if (current === "none")   return "viewer";
  if (current === "viewer") return "editor";
  return "none";
}

// ── Pill clicable per una secció ─────────────────────────────────────────────
function SectionRolePill({
  role,
  onClick,
  disabled = false,
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
        disabled && "cursor-default"
      )}
      title={disabled ? undefined : `Clic per canviar (${cfg.label})`}
    >
      {cfg.icon} {cfg.label}
    </button>
  );
}

// ── Matriu de permisos per a un usuari ───────────────────────────────────────
function PermissionsMatrix({
  permissions,
  isAdmin,
  onChange,
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
    <div className="space-y-3">
      {/* Botons ràpids */}
      {!isAdmin && (
        <div className="flex gap-2 flex-wrap">
          <span className="text-[11px] text-slate-400 self-center mr-1">Assignar tot:</span>
          <button
            type="button"
            onClick={() => setAll("none")}
            className="text-[11px] px-2 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            Sense accés
          </button>
          <button
            type="button"
            onClick={() => setAll("viewer")}
            className="text-[11px] px-2 py-0.5 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          >
            Tot visualitzador
          </button>
          <button
            type="button"
            onClick={() => setAll("editor")}
            className="text-[11px] px-2 py-0.5 rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
          >
            Tot editor
          </button>
        </div>
      )}

      {/* Grups de seccions */}
      {VIEW_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
            {group.label}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {group.views.map((view) => {
              const current = isAdmin ? "admin" : (permissions[view] ?? "none");
              return (
                <div
                  key={view}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100"
                >
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
        <p className="text-[11px] text-slate-400 italic">
          Els administradors tenen accés complet a totes les seccions.
        </p>
      )}
    </div>
  );
}

// ── Resum compacte de permisos (mode lectura) ────────────────────────────────
function PermissionsSummary({ profile }: { profile: UserProfile }) {
  if (profile.role === "admin") {
    return (
      <span className="text-[11px] text-violet-600 italic flex items-center gap-1">
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

// ── Component principal ──────────────────────────────────────────────────────
export function UserManagerPage() {
  const { profile: myProfile, getToken } = useAuth();
  const [users, setUsers]       = useState<UserProfile[]>([]);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Formulari nou usuari
  const [email, setEmail]       = useState("");
  const [fullName, setFullName] = useState("");
  const [level, setLevel]       = useState<UserPermissionLevel>("user");
  const [newPerms, setNewPerms] = useState<SectionPermissions>({ ...DEFAULT_SECTION_PERMISSIONS });
  const [submitting, setSubmitting] = useState(false);

  // Edició usuari existent
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editLevel, setEditLevel]   = useState<UserPermissionLevel>("user");
  const [editPerms, setEditPerms]   = useState<SectionPermissions>({ ...DEFAULT_SECTION_PERMISSIONS });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = getToken();
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
          }));
          setUsers(raw);
          usedApi = true;
        } else {
          // L'API ha respost però amb error — mostra el missatge del servidor
          const json = await res.json().catch(() => ({}));
          console.error("API /list-users error:", res.status, json.error);
          toast.error(`Error de l'API: ${json.error ?? res.statusText}`);
        }
      } catch (apiErr: any) {
        // L'API no és accessible (dev local sense Vercel, o error de xarxa)
        // → intentem llegir directament des del client Supabase
        console.warn("API /list-users no disponible, fallback a Supabase directe:", apiErr.message);
      }
      if (!usedApi) {
        // Fallback: lectura directa. Funciona si l'usuari té permisos RLS adequats
        // o si la taula user_profiles és accessible amb la clau anon.
        const { data, error } = await supabase
          .from("user_profiles")
          .select("id, email, full_name, role, allowed_views")
          .order("email");
        if (!error && data) {
          setUsers(data.map((u: any) => ({
            ...u,
            // Fallback: si no hi ha email al perfil, deixem buit (no podem
            // consultar auth.users des del client sense service role)
            email:               u.email ?? "",
            role:                parseUserPermissionLevel(u.role),
            section_permissions: parseSectionPermissions(u.allowed_views),
          })));
        } else {
          console.error("Error Supabase directe:", error);
          toast.error(
            error?.code === "42703"
              ? "La taula user_profiles no té totes les columnes esperades. Revisa l'esquema de Supabase."
              : `Error carregant usuaris: ${error?.message ?? "error desconegut"}`
          );
        }
      }
    } catch {
      toast.error("Error carregant usuaris");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

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
          allowed_views: level === "admin" ? null : newPerms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error convidant usuari");
      toast.success(`Invitació enviada a ${email}`);
      setEmail(""); setFullName(""); setLevel("user");
      setNewPerms({ ...DEFAULT_SECTION_PERMISSIONS });
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

  const startEditing = (u: UserProfile) => {
    setEditingId(u.id);
    setEditLevel(u.role);
    setEditPerms(u.section_permissions ?? { ...FULL_SECTION_PERMISSIONS });
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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Capçalera */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-[#0099A8]" />
          Gestió d'usuaris
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Administra els usuaris i configura els permisos per cada finestra
        </p>
      </div>

      {/* Llegenda */}
      <div className="flex flex-wrap gap-3 text-[11px]">
        {(["none", "viewer", "editor"] as SectionRole[]).map((r) => {
          const cfg = SECTION_ROLE_CONFIG[r];
          return (
            <span key={r} className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-full border font-medium", cfg.color)}>
              {cfg.icon} {cfg.label}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full border font-medium bg-violet-50 text-violet-700 border-violet-200">
          <Shield className="h-3 w-3" /> Administrador (accés complet)
        </span>
        <span className="text-slate-400 self-center ml-1">· Clica les pastilles per canviar el permís</span>
      </div>

      {/* Formulari invitació */}
      <Card className="p-5 border-0 shadow-sm bg-white">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-lg bg-[#0099A8]/10 flex items-center justify-center">
            <UserPlus className="h-4 w-4 text-[#0099A8]" />
          </div>
          <p className="text-sm font-semibold text-[#006E7A]">Convidar nou usuari</p>
        </div>

        <div className="flex items-start gap-2 p-3 rounded-lg bg-[#0099A8]/5 border border-[#0099A8]/15 text-xs text-[#006E7A] mb-4">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          L'usuari rebrà un correu d'invitació per establir la seva pròpia contrasenya.
        </div>

        <form onSubmit={handleInvite} className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-slate-700">Correu electrònic *</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuari@example.com" required className="h-9" />
            </div>
            <div className="space-y-1 flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-slate-700">Nom complet</label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="Nom i cognoms" className="h-9" />
            </div>
            <div className="space-y-1 w-52">
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

          {/* Matriu de permisos per al nou usuari */}
          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50/50">
            <p className="text-xs font-semibold text-slate-600 mb-3">Permisos per finestra</p>
            <PermissionsMatrix
              permissions={newPerms}
              isAdmin={level === "admin"}
              onChange={setNewPerms}
            />
          </div>

          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={submitting}
              className="bg-[#0099A8] hover:bg-[#006E7A] gap-1.5">
              <Send className="h-4 w-4" />
              {submitting ? "Enviant invitació…" : "Envia invitació"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Llistat d'usuaris */}
      <Card className="border-0 shadow-sm bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">
            {users.length} usuari{users.length !== 1 ? "s" : ""}
          </p>
          <Button variant="ghost" size="sm" onClick={fetchUsers} disabled={loading} className="gap-1.5 text-xs">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualitza
          </Button>
        </div>

        <div className="divide-y divide-slate-50">
          {users.map((u) => {
            const isMe      = u.id === myProfile?.id;
            const isEditing = editingId === u.id;
            const isOpen    = expanded === u.id;

            return (
              <div key={u.id} className={cn("transition-colors", isMe && "bg-[#0099A8]/3")}>
                {/* Fila principal */}
                <div className="flex items-center gap-3 px-5 py-3">
                  {/* Avatar */}
                  <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-xs font-bold text-slate-500">
                    {((u.full_name || u.email || "?")[0]).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-700 truncate">
                        {u.full_name || u.email}
                      </span>
                      {isMe && (
                        <Badge className="text-[10px] px-1.5 py-0 bg-[#0099A8] text-white border-0">Jo</Badge>
                      )}
                      <Badge className={cn("text-[10px] px-1.5 py-0 border-0 font-normal", LEVEL_COLORS[u.role])}>
                        {u.role === "admin" && <Shield className="h-2.5 w-2.5 mr-0.5 inline" />}
                        {LEVEL_LABELS[u.role]}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">{u.email}</p>
                  </div>

                  {/* Resum permisos */}
                  <div className="hidden md:block flex-1 min-w-0">
                    <PermissionsSummary profile={u} />
                  </div>

                  {/* Accions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!isMe && (
                      <>
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => {
                            if (isEditing) { setEditingId(null); setExpanded(null); }
                            else startEditing(u);
                          }}
                          title={isEditing ? "Cancel·la" : "Edita permisos"}
                        >
                          {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600" title="Elimina">
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
                      </>
                    )}
                    <button
                      className="h-7 w-7 flex items-center justify-center text-slate-400 hover:text-slate-600"
                      onClick={() => setExpanded(isOpen ? null : u.id)}
                      title={isOpen ? "Amaga permisos" : "Mostra permisos"}
                    >
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Panell expandible amb la matriu */}
                {isOpen && (
                  <div className="px-5 pb-5 pt-1 border-t border-slate-50 bg-slate-50/40">
                    {isEditing ? (
                      <div className="space-y-4">
                        {/* Selector d'accés admin/usuari */}
                        <div className="space-y-1 w-52">
                          <label className="text-xs font-medium text-slate-600">Tipus d'accés</label>
                          <Select value={editLevel} onValueChange={(v) => setEditLevel(v as UserPermissionLevel)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">Usuari (permisos per finestra)</SelectItem>
                              <SelectItem value="admin">Administrador (accés complet)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <PermissionsMatrix
                          permissions={editPerms}
                          isAdmin={editLevel === "admin"}
                          onChange={setEditPerms}
                        />

                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="bg-[#0099A8] hover:bg-[#006E7A] gap-1"
                            onClick={() => handleUpdateUser(u.id)}
                          >
                            <Check className="h-3.5 w-3.5" /> Desa canvis
                          </Button>
                          <Button
                            size="sm" variant="outline" className="gap-1"
                            onClick={() => { setEditingId(null); setExpanded(null); }}
                          >
                            <X className="h-3.5 w-3.5" /> Cancel·la
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2">
                        <PermissionsMatrix
                          permissions={u.section_permissions ?? { equips: "editor", gubimclass: "editor", fields: "editor", revit: "editor", projectes: "editor", rosmiman: "editor" }}
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

          {users.length === 0 && !loading && (
            <div className="px-5 py-12 text-center text-slate-400 text-sm">
              Cap usuari trobat
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
