// src/components/auth/UserManagerPage.tsx
// Versió en pàgina completa (no pop-up) de la gestió d'usuaris.
// Manté tota la lògica original de UserManagerDialog.
import { useEffect, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
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
  type UserRole,
  type UserProfile,
  type AppView,
  ALL_VIEWS,
  VIEW_LABELS,
} from "@/lib/auth";
import { Pencil, Trash2, UserPlus, RefreshCw, Send, Check, X, Info, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<UserRole, string> = {
  viewer: "Visualitzador",
  editor: "Editor",
  admin: "Administrador",
};

const ROLE_COLORS: Record<UserRole, string> = {
  viewer: "bg-slate-100 text-slate-700",
  editor: "bg-blue-100 text-blue-700",
  admin: "bg-violet-100 text-violet-700",
};

export function UserManagerPage() {
  const { profile: myProfile, getToken } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [newUserViews, setNewUserViews] = useState<AppView[]>([...ALL_VIEWS]);
  const [submitting, setSubmitting] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("viewer");
  const [editViews, setEditViews] = useState<AppView[]>([...ALL_VIEWS]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const controller = new AbortController();
      const apiTimeout = setTimeout(() => controller.abort(), 10000);
      let usedApi = false;
      try {
        const res = await fetch("/api/list-users", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        clearTimeout(apiTimeout);
        if (res.ok) {
          const json = await res.json();
          setUsers((json.users ?? []) as UserProfile[]);
          usedApi = true;
        }
      } catch (apiErr) {
        clearTimeout(apiTimeout);
      }
      if (!usedApi) {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("id, email, full_name, role, allowed_views")
          .order("email");
        if (!error && data) setUsers(data as UserProfile[]);
        else toast.error("Error carregant usuaris");
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let res: Response;
      try {
        res = await fetch("/api/create-user", {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ email: email.trim(), full_name: fullName.trim(), role, allowed_views: newUserViews }),
        });
      } finally {
        clearTimeout(timeout);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error convidant usuari");
      toast.success(`Invitació enviada a ${email}`);
      setEmail(""); setFullName(""); setRole("viewer"); setNewUserViews([...ALL_VIEWS]);
      await fetchUsers();
    } catch (err: any) {
      if (err.name === "AbortError") {
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
    setEditRole(u.role as UserRole);
    setEditViews(u.allowed_views ?? [...ALL_VIEWS]);
  };

  const handleUpdateUser = async (userId: string) => {
    const { error } = await supabase
      .from("user_profiles")
      .update({ role: editRole, allowed_views: editViews })
      .eq("id", userId);
    if (error) return toast.error("Error actualitzant usuari");
    toast.success("Usuari actualitzat");
    setEditingId(null);
    await fetchUsers();
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

  const toggleView = (view: AppView, current: AppView[], setter: (v: AppView[]) => void) => {
    setter(current.includes(view) ? current.filter((v) => v !== view) : [...current, view]);
  };

  return (
    <div className="space-y-6">
      {/* Capçalera de pàgina */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-[#0099A8]" />
          Gestió d'usuaris
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Administra els usuaris i els permisos d'accés a la plataforma
        </p>
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
          <span>
            L'usuari rebrà un correu d'invitació per establir la seva pròpia contrasenya.
            Tu només has de configurar el rol i les vistes accessibles.
          </span>
        </div>

        <form onSubmit={handleInvite} className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs font-medium text-slate-700">Correu electrònic *</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuari@example.com"
                required
                className="h-9"
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[160px]">
              <label className="text-xs font-medium text-slate-700">Nom complet</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nom i cognoms"
                className="h-9"
              />
            </div>
            <div className="space-y-1 w-44">
              <label className="text-xs font-medium text-slate-700">Rol</label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Visualitzador</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-700">Vistes accessibles</label>
            <div className="flex flex-wrap gap-4">
              {ALL_VIEWS.map((v) => (
                <label key={v} className="flex items-center gap-1.5 text-xs cursor-pointer select-none text-slate-600">
                  <Checkbox
                    checked={newUserViews.includes(v)}
                    onCheckedChange={() => toggleView(v, newUserViews, setNewUserViews)}
                  />
                  {VIEW_LABELS[v]}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-slate-400">
              <strong className="text-slate-500">Visualitzador:</strong> consulta.&nbsp;
              <strong className="text-slate-500">Editor:</strong> crea, edita i esborra.&nbsp;
              <strong className="text-slate-500">Admin:</strong> accés complet.
            </p>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-[#0099A8] hover:bg-[#006E7A] gap-1.5 shrink-0"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Enviant invitació…" : "Envia invitació"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Taula d'usuaris */}
      <Card className="p-0 border-0 shadow-sm bg-white overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-700">
            {users.length} usuari{users.length !== 1 ? "s" : ""}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualitza
          </Button>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Correu</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Nom</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rol</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Vistes</th>
                <th className="px-4 py-3 w-28 text-xs font-semibold text-slate-500 uppercase tracking-wide">Accions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === myProfile?.id;
                const isEditing = editingId === u.id;
                const effectiveViews = u.role === "admin" ? ALL_VIEWS : u.allowed_views ?? ALL_VIEWS;

                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-t border-slate-50 hover:bg-slate-50/60 align-top transition-colors",
                      isMe && "bg-[#0099A8]/3"
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {u.email}
                      {isMe && (
                        <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-[#0099A8] text-white border-0">
                          Jo
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">{u.full_name ?? "—"}</td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                          <SelectTrigger className="h-7 text-xs w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Visualitzador</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={cn("text-xs font-normal border-0", ROLE_COLORS[u.role as UserRole])}>
                          {ROLE_LABELS[u.role as UserRole] ?? u.role}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-2">
                          {ALL_VIEWS.map((v) => (
                            <label
                              key={v}
                              className={cn(
                                "flex items-center gap-1 text-xs cursor-pointer select-none text-slate-600",
                                editRole === "admin" && "opacity-50 pointer-events-none"
                              )}
                            >
                              <Checkbox
                                checked={editRole === "admin" || editViews.includes(v)}
                                onCheckedChange={() => toggleView(v, editViews, setEditViews)}
                                disabled={editRole === "admin"}
                              />
                              {VIEW_LABELS[v]}
                            </label>
                          ))}
                          {editRole === "admin" && (
                            <span className="text-[10px] text-slate-400 italic">Admin veu tot</span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.role === "admin" ? (
                            <span className="text-[10px] text-slate-400 italic">Totes</span>
                          ) : (
                            effectiveViews.map((v) => (
                              <Badge key={v} variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                                {VIEW_LABELS[v]}
                              </Badge>
                            ))
                          )}
                          {u.role !== "admin" && effectiveViews.length === 0 && (
                            <span className="text-[10px] text-destructive">Cap vista</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-[#0099A8] hover:bg-[#006E7A] gap-1"
                              onClick={() => handleUpdateUser(u.id)}
                            >
                              <Check className="h-3 w-3" /> Desa
                            </Button>
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-3 w-3" /> Cancel·la
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              disabled={isMe} onClick={() => startEditing(u)}
                              title="Edita"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!isMe && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Elimina">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Eliminar usuari?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      S'eliminarà <strong>{u.email}</strong> de forma permanent.
                                      Aquesta acció no es pot desfer.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive hover:bg-destructive/90"
                                      onClick={() => handleDelete(u.id, u.email)}
                                    >
                                      Elimina l'usuari
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">
                    Cap usuari trobat
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
