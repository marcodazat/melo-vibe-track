import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { User, AtSign, DollarSign, Camera } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const ProfileSetup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [venmo, setVenmo] = useState("");
  const [cashapp, setCashapp] = useState("");
  const [zelle, setZelle] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setDisplayName(data.display_name || "");
            setUsername(data.username || "");
            setVenmo(data.venmo_handle || "");
            setCashapp(data.cashapp_handle || "");
            setZelle(data.zelle_handle || "");
            setAvatarUrl(data.avatar_url);
          }
        });
    }
  }, [user]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);
    const fileExt = file.name.split(".").pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      toast.error("Upload failed");
      setUploading(false);
      return;
    }

    const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName,
        username,
        venmo_handle: venmo,
        cashapp_handle: cashapp,
        zelle_handle: zelle,
        avatar_url: avatarUrl,
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile saved!");
      navigate("/dashboard");
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background gradient-mesh p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <h1 className="text-2xl font-bold text-foreground mb-2">Set up your profile</h1>
        <p className="text-muted-foreground mb-8">Let your friends know who you are</p>

        <div className="glass rounded-2xl p-8 neon-glow">
          <form onSubmit={handleSave} className="space-y-6">
            {/* Avatar */}
            <div className="flex justify-center">
              <label className="relative cursor-pointer group">
                <Avatar className="w-24 h-24 border-2 border-primary/30">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="bg-secondary text-muted-foreground">
                    <User className="w-10 h-10" />
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-6 h-6 text-primary" />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground/80 flex items-center gap-2">
                  <User className="w-3.5 h-3.5" /> Display Name
                </Label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                  className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground/80 flex items-center gap-2">
                  <AtSign className="w-3.5 h-3.5" /> Username
                </Label>
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="unique_handle"
                  className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
            </div>

            <div className="border-t border-glass-border/30 pt-4">
              <p className="text-sm text-muted-foreground mb-3 flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5" /> Payment handles (optional)
              </p>
              <div className="space-y-3">
                <Input
                  value={venmo}
                  onChange={(e) => setVenmo(e.target.value)}
                  placeholder="Venmo handle"
                  className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
                />
                <Input
                  value={cashapp}
                  onChange={(e) => setCashapp(e.target.value)}
                  placeholder="Cash App handle"
                  className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
                />
                <Input
                  value={zelle}
                  onChange={(e) => setZelle(e.target.value)}
                  placeholder="Zelle email or phone"
                  className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-semibold"
            >
              {saving ? "Saving..." : "Save Profile"}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default ProfileSetup;
