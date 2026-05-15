// src/components/auth/UserManagerDialog.tsx
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
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
  Info, Users, Shield, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

const LEVEL_LABELS: Record<UserPermissionLevel, string> = {
  user:  "Usuari",
  admin: "Administrador",
};

const LEVEL_COLORS: Record<UserPermissionLevel, string> = {
  user:  "bg-slate-100 text-slate-600",
  admin: "bg-violet-100 text-violet-700",
};

// ── Selector de rol per secció ────────────────────────────────────────────────
function SectionRoleSelect({
  view,
  role,
  disabled,
  onChange,
}: {
  view: AppView;
  role: SectionRole | "admin";
  disabled?: boolean;
  onChange: (r: SectionRole) => void;
}) {
  if (role === "admin" || disabled) {
    return (
      <div className={cn(
        "flex items-center justify-end gap-1 text-xs",
        role === "admin" ? "text-violet-500" : "text-slate-400"
      )}>
        {role === "admin" && <Shield className="h-3 w-3" />}
        <span>
          {role === "admin"
            ? "Accés complet"
            : role === "none"
            ? "Sense accés"
            : role === "viewer"
            ? "Visualitzador"
            : "Editor"}
        </span>
      </div>
    );
  }
  return (
    <Select value={role} onValueChange={(v) => onChange(v as SectionRole)}>
      <SelectTrigger
        className={cn(
          "h-7 w-36 text-xs",
          role === "none"   && "text-slate-400 border-slate-200",
          role === "viewer" && "text-emerald-700 border-emerald-200 bg-emerald-50/50",
          role === "editor" && "text-blue-700 border-blue-200 bg-blue-50/50"
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none"   className="text-xs text-slate-400">Sense accés</SelectItem>
        <SelectItem value="viewer" className="text-xs text-emerald-700">Visualitzador</SelectItem>
        <SelectItem value="editor" className="text-xs text-blue-700">Editor</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Panell dret: permisos d'un usuari existent ────────────────────────────────
function PermissionsPanel({
  user, isEditing, editLevel, editPerms,
  onLevelChange, onPermChange, onSave, onStartEdit, onCancel,
  onDelete, isMe, isSaving,
}: {
  user: UserProfile;
  isEditing: boolean;
  editLevel: UserPermissionLevel;
  editPerms: SectionPermissions;
  onLevelChange: (l: UserPermissionLevel) => void;
  onPermChange: (view: AppView, role: SectionRole) => void;
  onSave: () => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  isMe: boolean;
  isSaving: boolean;
}) {
  const displayLevel = isEditing ? editLevel : user.role;
  const displayPerms = isEditing
    ? editPerms
    : (user.section_permissions ?? { ...FULL_SECTION_PERMISSIONS });

  return (
    <div className="flex flex-col h-full">
      {/* Capçalera usuari */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-[#0099A8]/10 flex items-center justify-center shrink-0 text-sm font-bold text-[#0099A8]">
            {((user.full_name || user.email || "?")[0]).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-800 truncate">
                {user.full_name || user.email}
              </p>
              {isMe && (
                <Badge className="text-[10px] px-1.5 py-0 bg-[#0099A8] text-white border-0">Jo</Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* Toggle admin / usuari normal */}
        {!isMe && (
          <div className="mt-3 space-y-1">
            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
              Tipus d'accés
            </label>
            {isEditing ? (
              <Select value={editLevel} onValueChange={(v) => onLevelChange(v as UserPermissionLevel)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuari (permisos per finestra)</SelectItem>
                  <SelectItem value="admin">Administrador (accés complet)</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium", LEVEL_COLORS[displayLevel])}>
                {displayLevel === "admin" && <Shield className="h-3 w-3" />}
                {LEVEL_LABELS[displayLevel]}
              </span>
            )}
          </div>
        )}
        {isMe && (
          <div className="mt-3">
            <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium", LEVEL_COLORS[displayLevel])}>
              {displayLevel === "admin" && <Shield className="h-3 w-3" />}
              {LEVEL_LABELS[displayLevel]}
            </span>
          </div>
        )}
      </div>

      {/* Permisos per secció */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {displayLevel === "admin" ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-50 border border-violet-100 text-xs text-violet-700">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            Els administradors tenen accés complet a totes les seccions.
          </div>
        ) : (
          VIEW_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{group.label}</p>
              <div className="space-y-1">
                {group.views.map((view) => {
                  const current = displayPerms[view] ?? "none";
                  return (
                    <div key={view} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-50">
                      <span className="flex items-center gap-2 text-xs text-slate-700">
                        <span className="text-base leading-none">{VIEW_ICONS[view]}</span>
                        {VIEW_LABELS[view]}
                      </span>
                      <SectionRoleSelect
                        view={view}
                        role={current}
                        disabled={!isEditing || isMe}
                        onChange={(r) => onPermChange(view, r)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Botons d'acció */}
      {!isMe && (
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 space-y-2">
          {isEditing ? (
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 bg-[#0099A8] hover:bg-[#006E7A] gap-1.5" onClick={onSave} disabled={isSaving}>
                <Check className="h-3.5 w-3.5" />{isSaving ? "Desant…" : "Desa canvis"}
              </Button>
              <Button size="sm" variant="outline" onClick={onCancel} className="gap-1">
                <X className="h-3.5 w-3.5" /> Cancel·la
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="w-full gap-1.5 border-[#0099A8]/30 text-[#006E7A] hover:bg-[#0099A8]/5" onClick={onStartEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edita permisos
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="w-full gap-1.5 text-red-400 hover:text-red-600 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" /> Elimina usuari
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar usuari?</AlertDialogTitle>
                <AlertDialogDescription>
                  S'eliminarà <strong>{user.email}</strong> de forma permanent. Aquesta acció no es pot desfer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={onDelete}>
                  Elimina
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

// ── Panell dret: formulari nou usuari ─────────────────────────────────────────
function NewUserPanel({ onInvited, getToken }: { onInvited: () => void; getToken: () => string }) {
  const [email, setEmail]       = useState("");
  const [fullName, setFullName] = useState("");
  const [level, setLevel]       = useState<UserPermissionLevel>("user");
  const [perms, setPerms]       = useState<SectionPermissions>({ ...DEFAULT_SECTION_PERMISSIONS });
  const [submitting, setSubmitting] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error("El correu és obligatori");
    setSubmitting(true);
    try {
      const res = await fetch("/api/create-user", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          email:         email.trim(),
          full_name:     fullName.trim(),
          role:          level,
          allowed_views: level === "admin" ? null : perms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error convidant usuari");
      toast.success(`Invitació enviada a ${email}`);
      setEmail(""); setFullName(""); setLevel("user");
      setPerms({ ...DEFAULT_SECTION_PERMISSIONS });
      onInvited();
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

  return (
    <form onSubmit={handleInvite} className="flex flex-col h-full">
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-8 w-8 rounded-full bg-[#0099A8]/10 flex items-center justify-center">
            <UserPlus className="h-4 w-4 text-[#0099A8]" />
          </div>
          <p className="text-sm font-semibold text-[#006E7A]">Convidar nou usuari</p>
        </div>
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[#0099A8]/5 border border-[#0099A8]/15 text-xs text-[#006E7A] mb-4">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          L'usuari rebrà un correu d'invitació per establir la seva pròpia contrasenya.
        </div>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Correu electrònic *</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuari@example.com" required className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Nom complet</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nom i cognoms" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">Tipus d'accés</label>
            <Select value={level} onValueChange={(v) => setLevel(v as UserPermissionLevel)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Usuari (permisos per finestra)</SelectItem>
                <SelectItem value="admin">Administrador (accés complet)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {level === "admin" ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-violet-50 border border-violet-100 text-xs text-violet-700">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            Els administradors tenen accés complet a totes les seccions.
          </div>
        ) : (
          VIEW_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">{group.label}</p>
              <div className="space-y-1">
                {group.views.map((view) => (
                  <div key={view} className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg hover:bg-slate-50">
                    <span className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="text-base leading-none">{VIEW_ICONS[view]}</span>
                      {VIEW_LABELS[view]}
                    </span>
                    <SectionRoleSelect
                      view={view}
                      role={perms[view] ?? "none"}
                      onChange={(r) => setPerms((p) => ({ ...p, [view]: r }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50">
        <Button type="submit" disabled={submitting} className="w-full bg-[#0099A8] hover:bg-[#006E7A] gap-1.5">
          <Send className="h-4 w-4" />
          {submitting ? "Enviant invitació…" : "Envia invitació"}
        </Button>
      </div>
    </form>
  );
}

// ── Component principal ───────────────────────────────────────────────────────
export function UserManagerDialog({ open, onOpenChange }: Props) {
  const { profile: myProfile, getToken } = useAuth();
  const [users, setUsers]         = useState<UserProfile[]>([]);
  const [loading, setLoading]     = useState(false);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving]   = useState(false);
  const [editLevel, setEditLevel] = useState<UserPermissionLevel>("user");
  const [editPerms, setEditPerms] = useState<SectionPermissions>({ ...DEFAULT_SECTION_PERMISSIONS });

  const selectedUser = users.find((u) => u.id === selectedId) ?? null;

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
          setUsers((json.users ?? []).map((u: any) => ({
            ...u,
            role: parseUserPermissionLevel(u.role),
            section_permissions: parseSectionPermissions(u.allowed_views ?? u.section_permissions),
          })));
          usedApi = true;
        }
      } catch {}
      if (!usedApi) {
        const { data, error } = await supabase.from("user_profiles").select("id, email, full_name, role, allowed_views").order("email");
        if (!error && data) {
          setUsers(data.map((u: any) => ({
            ...u,
            role: parseUserPermissionLevel(u.role),
            section_permissions: parseSectionPermissions(u.allowed_views),
          })));
        } else {
          toast.error("Error carregant usuaris");
        }
      }
    } catch {
      toast.error("Error carregant usuaris");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) { fetchUsers(); setSelectedId(null); setIsEditing(false); }
  }, [open]);

  const selectUser = (user: UserProfile) => {
    setSelectedId(user.id);
    setIsEditing(false);
    setEditLevel(user.role);
    setEditPerms(user.section_permissions ?? { ...FULL_SECTION_PERMISSIONS });
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setIsSaving(true);
    try {
      const res = await fetch("/api/update-user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          user_id:       selectedUser.id,
          role:          editLevel,
          allowed_views: editLevel === "admin" ? null : editPerms,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error actualitzant usuari");
      toast.success("Usuari actualitzat");
      setIsEditing(false);
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message ?? "Error actualitzant usuari");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    try {
      const res = await fetch("/api/delete-user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ user_id: selectedUser.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error eliminant usuari");
      toast.success(`${selectedUser.email} eliminat correctament`);
      setSelectedId(null);
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message ?? "Error eliminant usuari");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[82vh] p-0 overflow-hidden flex flex-col gap-0">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-[#0099A8]" />
            Membres: gestió d'usuaris i permisos
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Llista esquerra */}
          <div className="w-64 shrink-0 border-r border-slate-100 flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-500">
                {users.length} usuari{users.length !== 1 ? "s" : ""}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchUsers} disabled={loading} title="Actualitza">
                  <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-[#0099A8]" onClick={() => { setSelectedId("new"); setIsEditing(false); }} title="Afegir membre">
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Botó nou usuari */}
              <button
                type="button"
                onClick={() => { setSelectedId("new"); setIsEditing(false); }}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-slate-50",
                  selectedId === "new"
                    ? "bg-[#0099A8]/8 border-l-2 border-l-[#0099A8]"
                    : "hover:bg-slate-50 border-l-2 border-l-transparent"
                )}
              >
                <div className="h-7 w-7 rounded-full bg-[#0099A8]/10 flex items-center justify-center shrink-0">
                  <UserPlus className="h-3.5 w-3.5 text-[#0099A8]" />
                </div>
                <p className="text-xs font-medium text-[#006E7A]">Afegir membre</p>
                {selectedId === "new" && <ChevronRight className="h-3.5 w-3.5 text-[#0099A8] ml-auto shrink-0" />}
              </button>

              {users.map((u) => {
                const isMe       = u.id === myProfile?.id;
                const isSelected = u.id === selectedId;
                return (
                  <button
                    type="button"
                    key={u.id}
                    onClick={() => selectUser(u)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                      isSelected
                        ? "bg-[#0099A8]/8 border-l-2 border-l-[#0099A8]"
                        : "hover:bg-slate-50 border-l-2 border-l-transparent",
                      isMe && !isSelected && "bg-[#0099A8]/3"
                    )}
                  >
                    <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-[11px] font-bold text-slate-500">
                      {((u.full_name || u.email || "?")[0]).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-xs font-medium text-slate-700 truncate">{u.full_name || u.email}</p>
                        {isMe && <span className="shrink-0 text-[9px] px-1 rounded bg-[#0099A8]/10 text-[#0099A8] font-medium">Jo</span>}
                      </div>
                      <span className={cn("text-[10px] px-1.5 rounded font-medium mt-0.5 inline-block", LEVEL_COLORS[u.role])}>
                        {LEVEL_LABELS[u.role]}
                      </span>
                    </div>
                    {isSelected && <ChevronRight className="h-3.5 w-3.5 text-[#0099A8] shrink-0" />}
                  </button>
                );
              })}

              {users.length === 0 && !loading && (
                <p className="px-4 py-6 text-xs text-center text-slate-400">Cap usuari trobat</p>
              )}
            </div>
          </div>

          {/* Panell dret */}
          <div className="flex-1 overflow-hidden">
            {selectedId === "new" ? (
              <NewUserPanel getToken={getToken} onInvited={() => { fetchUsers(); setSelectedId(null); }} />
            ) : selectedUser ? (
              <PermissionsPanel
                user={selectedUser}
                isEditing={isEditing}
                editLevel={editLevel}
                editPerms={editPerms}
                onLevelChange={setEditLevel}
                onPermChange={(view, role) => setEditPerms((p) => ({ ...p, [view]: role }))}
                onSave={handleSave}
                onStartEdit={() => setIsEditing(true)}
                onCancel={() => setIsEditing(false)}
                onDelete={handleDelete}
                isMe={selectedUser.id === myProfile?.id}
                isSaving={isSaving}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                <Users className="h-8 w-8 text-slate-200" />
                <p className="text-sm">Selecciona un membre per veure els seus permisos</p>
                <p className="text-xs text-slate-300">o afegeix un nou membre</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
