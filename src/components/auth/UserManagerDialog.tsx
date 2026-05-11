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
import { Checkbox } from "@/components/ui/checkbox";
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
import { Pencil, Trash2, UserPlus, RefreshCw, Send, Check, X, Info } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

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

// Retorna sempre un token vàlid: refresca la sessió si el token caduca en menys de 5 min
async function getFreshToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return "";
  const expiresAt = session.expires_at ?? 0;
  const nowSecs   = Math.floor(Date.now() / 1000);
  if (expiresAt - nowSecs < 5 * 60) {
    const { data } = await supabase.auth.refreshSession();
    return data.session?.access_token ?? "";
  }
  return session.access_token;
}

export function UserManagerDialog({ open, onOpenChange }: Props) {
  const { profile: myProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  // Formulari nou usuari (sense contrasenya)
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [newUserViews, setNewUserViews] = useState<AppView[]>([...ALL_VIEWS]);
  const [submitting, setSubmitting] = useState(false);

  // Edició inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("viewer");
  const [editViews, setEditViews] = useState<AppView[]>([...ALL_VIEWS]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const token = await getFreshToken();
      console.log("[fetchUsers] token obtingut:", token ? "OK" : "BUIT");

      // Timeout de 10s per si la funcio serverless tarda a despertar (cold start)
      const controller = new AbortController();
      const apiTimeout = setTimeout(() => controller.abort(), 10000);

      let usedApi = false;
      try {
        const res = await fetch("/api/list-users", {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        clearTimeout(apiTimeout);
        console.log("[fetchUsers] /api/list-users status:", res.status);
        if (res.ok) {
          const json = await res.json();
          setUsers((json.users ?? []) as UserProfile[]);
          usedApi = true;
        }
      } catch (apiErr) {
        clearTimeout(apiTimeout);
        console.warn("[fetchUsers] API fallback a Supabase directe:", apiErr);
      }

      // Fallback: si l'API no ha respost, llegim directament de Supabase
      if (!usedApi) {
        const { data, error } = await supabase
          .from("user_profiles")
          .select("id, email, full_name, role, allowed_views")
          .order("email");
        console.log("[fetchUsers] fallback supabase:", { count: data?.length, error });
        if (!error && data) setUsers(data as UserProfile[]);
        else toast.error("Error carregant usuaris");
      }
    } catch (err) {
      console.error("[fetchUsers] error general:", err);
      toast.error("Error carregant usuaris");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchUsers();
  }, [open]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return toast.error("El correu és obligatori");
    setSubmitting(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s màxim
      let res: Response;
      try {
        res = await fetch("/api/create-user", {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${await getFreshToken()}`,
          },
          body: JSON.stringify({
            email: email.trim(),
            full_name: fullName.trim(),
            role,
            allowed_views: newUserViews,
          }),
        });
      } finally {
        clearTimeout(timeout);
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error convidant usuari");
      toast.success(`Invitació enviada a ${email}`);
      setEmail("");
      setFullName("");
      setRole("viewer");
      setNewUserViews([...ALL_VIEWS]);
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
      const token = await getFreshToken();
      const res = await fetch("/api/delete-user", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
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

  const toggleView = (
    view: AppView,
    current: AppView[],
    setter: (v: AppView[]) => void
  ) => {
    setter(
      current.includes(view) ? current.filter((v) => v !== view) : [...current, view]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#0099A8]" />
            Gestió d'usuaris i permisos
          </DialogTitle>
        </DialogHeader>

        {/* Formulari invitació — sense contrasenya */}
        <div className="border rounded-md p-4 bg-muted/30 space-y-3">
          <div className="flex items-start gap-2">
            <p className="text-sm font-medium text-[#006E7A]">Convidar nou usuari</p>
          </div>

          {/* Nota informativa */}
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-[#0099A8]/5 border border-[#0099A8]/15 text-xs text-[#006E7A]">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              L'usuari rebrà un correu d'invitació per establir la seva pròpia contrasenya.
              Tu només has de configurar el rol i les vistes accessibles.
            </span>
          </div>

          <form onSubmit={handleInvite} className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1 flex-1 min-w-[200px]">
                <label className="text-xs font-medium">Correu electrònic *</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuari@example.com"
                  required
                />
              </div>
              <div className="space-y-1 flex-1 min-w-[160px]">
                <label className="text-xs font-medium">Nom complet</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nom i cognoms"
                />
              </div>
              <div className="space-y-1 w-40">
                <label className="text-xs font-medium">Rol</label>
                <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                  <SelectTrigger>
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

            {/* Vistes accessibles */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Vistes accessibles</label>
              <div className="flex flex-wrap gap-3">
                {ALL_VIEWS.map((v) => (
                  <label
                    key={v}
                    className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                  >
                    <Checkbox
                      checked={newUserViews.includes(v)}
                      onCheckedChange={() =>
                        toggleView(v, newUserViews, setNewUserViews)
                      }
                    />
                    {VIEW_LABELS[v]}
                  </label>
                ))}
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="bg-[#0099A8] hover:bg-[#006E7A] gap-1.5"
            >
              <Send className="h-4 w-4" />
              {submitting ? "Enviant invitació…" : "Envia invitació"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground">
            <strong>Visualitzador:</strong> només pot consultar dades.&nbsp;
            <strong>Editor:</strong> pot crear, editar i esborrar registres.&nbsp;
            <strong>Administrador:</strong> accés complet incloent gestió d'usuaris (veu sempre totes les vistes).
          </p>
        </div>

        {/* Llista d'usuaris */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {users.length} usuari{users.length !== 1 ? "s" : ""}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchUsers}
            disabled={loading}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualitza
          </Button>
        </div>

        <div className="border rounded-md flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted border-b">
              <tr className="text-left">
                <th className="p-2 text-xs font-semibold">Correu</th>
                <th className="p-2 text-xs font-semibold">Nom</th>
                <th className="p-2 text-xs font-semibold">Rol</th>
                <th className="p-2 text-xs font-semibold">Vistes</th>
                <th className="p-2 w-28 text-xs font-semibold">Accions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === myProfile?.id;
                const isEditing = editingId === u.id;
                const effectiveViews =
                  u.role === "admin"
                    ? ALL_VIEWS
                    : u.allowed_views ?? ALL_VIEWS;

                return (
                  <tr
                    key={u.id}
                    className={cn(
                      "border-t hover:bg-muted/30 align-top",
                      isMe && "bg-[#0099A8]/5"
                    )}
                  >
                    <td className="p-2 font-mono text-xs">
                      {u.email}
                      {isMe && (
                        <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-[#0099A8]">
                          Jo
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-xs">{u.full_name ?? "—"}</td>
                    <td className="p-2">
                      {isEditing ? (
                        <Select
                          value={editRole}
                          onValueChange={(v) => setEditRole(v as UserRole)}
                        >
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
                        <Badge
                          className={cn(
                            "text-xs font-normal border-0",
                            ROLE_COLORS[u.role as UserRole]
                          )}
                        >
                          {ROLE_LABELS[u.role as UserRole] ?? u.role}
                        </Badge>
                      )}
                    </td>
                    <td className="p-2">
                      {isEditing ? (
                        <div className="flex flex-wrap gap-2">
                          {ALL_VIEWS.map((v) => (
                            <label
                              key={v}
                              className={cn(
                                "flex items-center gap-1 text-xs cursor-pointer select-none",
                                editRole === "admin" && "opacity-50 pointer-events-none"
                              )}
                            >
                              <Checkbox
                                checked={editRole === "admin" || editViews.includes(v)}
                                onCheckedChange={() =>
                                  toggleView(v, editViews, setEditViews)
                                }
                                disabled={editRole === "admin"}
                              />
                              {VIEW_LABELS[v]}
                            </label>
                          ))}
                          {editRole === "admin" && (
                            <span className="text-[10px] text-muted-foreground italic">
                              Admin veu tot
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {u.role === "admin" ? (
                            <span className="text-[10px] text-muted-foreground italic">Totes</span>
                          ) : (
                            effectiveViews.map((v) => (
                              <Badge
                                key={v}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 font-normal"
                              >
                                {VIEW_LABELS[v]}
                              </Badge>
                            ))
                          )}
                          {!isEditing && u.role !== "admin" && effectiveViews.length === 0 && (
                            <span className="text-[10px] text-destructive">Cap vista</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2">
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
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!isMe && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
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
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    Cap usuari trobat
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
