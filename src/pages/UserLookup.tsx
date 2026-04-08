import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { Search, ArrowLeft, User, UserPlus, Clock, Check, X, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import TrustScoreBadge from "@/components/TrustScoreBadge";

interface ProfileResult {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  trust_score: number;
}

interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
}

type FriendStatus = "none" | "pending_sent" | "pending_received" | "friends";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const friendshipsTable = () => (supabase as any).from("friendships");

const UserLookup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [pendingRequests, setPendingRequests] = useState<ProfileResult[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadFriendships = useCallback(async () => {
    if (!user) return;
    const { data } = await friendshipsTable()
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    setFriendships(data || []);

    // Load profiles for incoming pending requests
    const incoming = (data || []).filter(
      (f: Friendship) => f.addressee_id === user.id && f.status === "pending"
    );
    if (incoming.length > 0) {
      const requesterIds = incoming.map((f: Friendship) => f.requester_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, avatar_url, trust_score")
        .in("user_id", requesterIds);
      setPendingRequests((profiles as ProfileResult[]) || []);
    } else {
      setPendingRequests([]);
    }
  }, [user]);

  useEffect(() => {
    loadFriendships();
  }, [loadFriendships]);

  const getFriendStatus = (targetUserId: string): FriendStatus => {
    const f = friendships.find(
      (fs) =>
        (fs.requester_id === user?.id && fs.addressee_id === targetUserId) ||
        (fs.addressee_id === user?.id && fs.requester_id === targetUserId)
    );
    if (!f) return "none";
    if (f.status === "accepted") return "friends";
    if (f.status === "pending") {
      return f.requester_id === user?.id ? "pending_sent" : "pending_received";
    }
    return "none";
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim().replace(/^@/, "");
    if (!trimmed || !user) return;

    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, username, avatar_url, trust_score")
      .neq("user_id", user.id)
      .ilike("username", trimmed)
      .limit(10);

    setResults((data as ProfileResult[]) || []);
    setSearched(true);
  };

  const sendRequest = async (targetId: string) => {
    if (!user) return;
    setActionLoading(targetId);
    const { error } = await friendshipsTable().insert({
      requester_id: user.id,
      addressee_id: targetId,
      status: "pending",
    });
    if (error) {
      toast.error("Could not send request");
    } else {
      toast.success("Friend request sent!");
      await loadFriendships();
    }
    setActionLoading(null);
  };

  const respondToRequest = async (requesterId: string, accept: boolean) => {
    if (!user) return;
    setActionLoading(requesterId);
    const f = friendships.find(
      (fs) => fs.requester_id === requesterId && fs.addressee_id === user.id
    );
    if (!f) { setActionLoading(null); return; }

    if (accept) {
      const { error } = await friendshipsTable()
        .update({ status: "accepted" })
        .eq("id", f.id);
      if (error) toast.error("Could not accept request");
      else toast.success("Friend request accepted!");
    } else {
      const { error } = await friendshipsTable().delete().eq("id", f.id);
      if (error) toast.error("Could not decline request");
      else toast.success("Request declined");
    }

    await loadFriendships();
    setActionLoading(null);
  };

  const removeFriend = async (targetId: string) => {
    if (!user) return;
    setActionLoading(targetId);
    const f = friendships.find(
      (fs) =>
        (fs.requester_id === user.id && fs.addressee_id === targetId) ||
        (fs.addressee_id === user.id && fs.requester_id === targetId)
    );
    if (!f) { setActionLoading(null); return; }
    const { error } = await friendshipsTable().delete().eq("id", f.id);
    if (error) toast.error("Could not remove friend");
    else { toast.success("Friend removed"); await loadFriendships(); }
    setActionLoading(null);
  };

  const FriendAction = ({ profile }: { profile: ProfileResult }) => {
    const status = getFriendStatus(profile.user_id);
    const loading = actionLoading === profile.user_id;

    if (status === "friends") {
      return (
        <Button
          size="sm"
          variant="ghost"
          disabled={loading}
          onClick={() => removeFriend(profile.user_id)}
          className="text-muted-foreground hover:text-destructive gap-1"
        >
          <Users className="w-4 h-4" /> Friends
        </Button>
      );
    }
    if (status === "pending_sent") {
      return (
        <Button size="sm" variant="ghost" disabled className="text-muted-foreground gap-1">
          <Clock className="w-4 h-4" /> Pending
        </Button>
      );
    }
    if (status === "pending_received") {
      return (
        <div className="flex gap-1">
          <Button size="sm" disabled={loading} onClick={() => respondToRequest(profile.user_id, true)} className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1">
            <Check className="w-3 h-3" /> Accept
          </Button>
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => respondToRequest(profile.user_id, false)} className="text-muted-foreground gap-1">
            <X className="w-3 h-3" />
          </Button>
        </div>
      );
    }
    return (
      <Button
        size="sm"
        disabled={loading}
        onClick={() => sendRequest(profile.user_id)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
      >
        <UserPlus className="w-4 h-4" /> Add
      </Button>
    );
  };

  const ProfileCard = ({ profile, index }: { profile: ProfileResult; index: number }) => (
    <motion.div
      key={profile.user_id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="glass rounded-xl p-4 flex items-center gap-4"
    >
      <Avatar className="w-12 h-12 border border-glass-border/30">
        <AvatarImage src={profile.avatar_url || undefined} />
        <AvatarFallback className="bg-secondary text-muted-foreground">
          <User className="w-5 h-5" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">
          {profile.display_name || profile.username || "User"}
        </p>
        {profile.username && (
          <p className="text-sm text-muted-foreground">@{profile.username}</p>
        )}
      </div>
      <TrustScoreBadge score={profile.trust_score ?? 60} size="sm" />
      <FriendAction profile={profile} />
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      <header className="glass-strong border-b border-glass-border/30 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Find People</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by exact @username..."
              className="pl-10 bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
            Search
          </Button>
        </form>

        {/* Incoming friend requests */}
        {pendingRequests.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Friend Requests ({pendingRequests.length})
            </h2>
            {pendingRequests.map((p, i) => (
              <ProfileCard key={p.user_id} profile={p} index={i} />
            ))}
          </div>
        )}

        {/* Search results */}
        <div className="space-y-3">
          {searched && results.length === 0 && (
            <p className="text-center py-12 text-muted-foreground">
              No user found with that username
            </p>
          )}
          {results.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Results
              </h2>
              {results.map((p, i) => (
                <ProfileCard key={p.user_id} profile={p} index={i} />
              ))}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default UserLookup;
