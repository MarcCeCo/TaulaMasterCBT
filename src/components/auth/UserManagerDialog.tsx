// src/components/auth/UserManagerDialog.tsx
// Gestió d'usuaris (només admins)

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/auth";
import {
  Loader2,
  UserPlus,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Users,
} from "lucide-react";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

interface UserManagerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type FormMode = "list" | "create" | "edit";

const EMPTY_FORM = { email: "", password: "", full_name: "", role: "viewer" as UserRole };

export function UserManagerDialog({ open, onOpenChange }: UserManagerDialogProps) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [mode, setMode] = useState<FormMode>("list");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  // Carregar usuaris
  async function loadUsers() {
    setLoadingUsers(true);
    const { data } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role, created_at")
      .order("created_at", { ascending: false });
    setUsers(data ?? []);
    setLoadingUsers(false);
  }

  useEffect(() => {
    if (open) {
      loadUsers();
      setMode("list");
      setFeedback(null);
    }
  }, [open]);

  // Crear usuari via Edge Function
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error creant usuari");
      setFeedback({ type: "ok", msg: `Usuari ${form.email} creat correctament` });
      setForm(EMPTY_FORM);
      setMode("list");
      await loadUsers();
    } catch (err: any) {
      setFeedback({ type: "err", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  // Editar rol
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    setFeedback(null);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ full_name: form.full_name, role: form.role })
        .eq("id", editId);
      if (error) throw error;
      setFeedback({ type: "ok", msg: "Usuari actualitzat correctament" });
      setMode("list");
      await loadUsers();
    } catch (err: any) {
      setFeedback({ type: "err", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  // Eliminar usuari (només el perfil; l'usuari d'auth s'ha d'eliminar via Dashboard o Edge Function)
  async function handleDelete(u: UserRow) {
    setSaving(true);
    try {
      await supabase.from("user_profiles").delete().eq("id", u.id);
      setDeleteTarget(null);
      await loadUsers();
      setFeedback({ type: "ok", msg: `Perfil de ${u.email} eliminat` });
    } catch (err: any) {
      setFeedback({ type: "err", msg: err.message });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(u: UserRow) {
    setEditId(u.id);
    setForm({ email: u.email, password: "", full_name: u.full_name ?? "", role: u.role });
    setMode("edit");
    setFeedback(null);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#006E7A]">
              <Users className="h-5 w-5" />
              Gestió d'usuaris
            </DialogTitle>
            <DialogDescription>
              Crea, edita i gestiona els permisos dels usuaris de l'aplicació.
            </DialogDescription>
          </DialogHeader>

          {/* Feedback */}
          {feedback && (
            <Alert
              variant={feedback.type === "err" ? "destructive" : "default"}
              className={`py-2.5 text-sm flex gap-2 items-center ${feedback.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : ""}`}
            >
              {feedback.type === "ok" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {feedback.msg}
            </Alert>
          )}

          {/* LLISTA */}
          {mode === "list" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-muted-foreground">{users.length} usuaris registrats</p>
                <Button
                  size="sm"
                  className="gap-1.5"
                  style={{ background: "linear-gradient(135deg, #006E7A 0%, #0099A8 100%)" }}
                  onClick={() => { setForm(EMPTY_FORM); setMode("create"); setFeedback(null); }}
                >
                  <UserPlus className="h-4 w-4" />
                  Nou usuari
                </Button>
              </div>

              {loadingUsers ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#0099A8]" />
                </div>
              ) : (
                <div className="divide-y rounded-lg border">
                  {users.map((u) => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{u.full_name || u.email}</span>
                          {u.id === currentUser?.id && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">Tu</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{u.email}</span>
                      </div>
                      <Badge className={`text-xs ${ROLE_COLORS[u.role]} border-0`}>
                        {ROLE_LABELS[u.role]}
                      </Badge>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => startEdit(u)}
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {u.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(u)}
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* FORMULARI CREACIÓ */}
          {mode === "create" && (
            <form onSubmit={handleCreate} className="space-y-4">
              <h3 className="font-semibold text-sm text-[#006E7A]">Nou usuari</h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="new-email">Correu electrònic *</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    placeholder="nom@exemple.com"
                  />
                </div>

                <div className="space-y-1.5 col-span-2">
                  <Label htmlFor="new-name">Nom complet</Label>
                  <Input
                    id="new-name"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Nom i cognoms"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Contrasenya inicial *</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    placeholder="Mínim 8 caràcters"
                    minLength={8}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-role">Rol *</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
                    <SelectTrigger id="new-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setMode("list")}>
                  Cancel·lar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="gap-1.5"
                  style={{ background: "linear-gradient(135deg, #006E7A 0%, #0099A8 100%)" }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Crear usuari
                </Button>
              </div>
            </form>
          )}

          {/* FORMULARI EDICIÓ */}
          {mode === "edit" && (
            <form onSubmit={handleEdit} className="space-y-4">
              <h3 className="font-semibold text-sm text-[#006E7A]">Editar usuari: {form.email}</h3>

              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Nom complet</Label>
                <Input
                  id="edit-name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Nom i cognoms"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-role">Rol</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRole })}>
                  <SelectTrigger id="edit-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                Per canviar la contrasenya d'un usuari, accedeix al Dashboard de Supabase.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setMode("list")}>
                  Cancel·lar
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  style={{ background: "linear-gradient(135deg, #006E7A 0%, #0099A8 100%)" }}
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Desar canvis
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmació eliminació */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuari?</AlertDialogTitle>
            <AlertDialogDescription>
              S'eliminarà el perfil de <strong>{deleteTarget?.email}</strong>.
              L'usuari no podrà accedir a l'aplicació.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel·lar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
