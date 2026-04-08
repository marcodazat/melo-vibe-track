import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { Tables } from "@/integrations/supabase/types";

type ProfileWithTrustScore = Tables<"profiles"> & { trust_score?: number };

interface CreateExchangeDialogProps {
  onCreated: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const friendshipsTable = () => (supabase as any).from("friendships");

const CreateExchangeDialog = ({ onCreated }: CreateExchangeDialogProps) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileWithTrustScore[]>([]);
  const [selectedUser, setSelectedUser] = useState<Tables<"profiles"> | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [exchangeType, setExchangeType] = useState("money");
  const [contractTerms, setContractTerms] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [friendIds, setFriendIds] = useState<string[]>([]);

  // Load accepted friend IDs when dialog opens
  useEffect(() => {
    if (!open || !user) return;
    friendshipsTable()
      .select("requester_id, addressee_id")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .eq("status", "accepted")
      .then(({ data }: { data: { requester_id: string; addressee_id: string }[] | null }) => {
        const ids = (data || []).map((f) =>
          f.requester_id === user.id ? f.addressee_id : f.requester_id
        );
        setFriendIds(ids);
      });
  }, [open, user]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2 || friendIds.length === 0) {
      setSearchResults([]);
      return;
    }

    const safeQuery = query.replace(/[%_(),]/g, "").trim().slice(0, 50);
    if (!safeQuery) {
      setSearchResults([]);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .in("user_id", friendIds)
      .or(`username.ilike.%${safeQuery}%,display_name.ilike.%${safeQuery}%`)
      .limit(5);

    setSearchResults(data || []);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedUser) return;

    if (title.length > 100) { toast.error("Title must be under 100 characters"); return; }
    if (description.length > 1000) { toast.error("Description must be under 1000 characters"); return; }
    if (contractTerms.length > 2000) { toast.error("Contract terms must be under 2000 characters"); return; }
    if (amount && (isNaN(parseFloat(amount)) || parseFloat(amount) < 0 || parseFloat(amount) > 999999)) {
      toast.error("Amount must be between 0 and 999,999"); return;
    }

    setLoading(true);
    const { error } = await supabase.from("exchanges").insert({
      creator_id: user.id,
      counterparty_id: selectedUser.user_id,
      title,
      description: description || null,
      amount: amount ? parseFloat(amount) : null,
      exchange_type: exchangeType,
      contract_terms: contractTerms || null,
      due_date: dueDate || null,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Exchange created!");
      setOpen(false);
      resetForm();
      onCreated();
    }
    setLoading(false);
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setAmount("");
    setExchangeType("money");
    setContractTerms("");
    setDueDate("");
    setSelectedUser(null);
    setSearchQuery("");
    setSearchResults([]);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 neon-glow gap-2">
          <Plus className="w-4 h-4" /> New Exchange
        </Button>
      </DialogTrigger>
      <DialogContent className="glass-strong border-glass-border/40 text-foreground max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Create Exchange</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* User search — friends only */}
          {!selectedUser ? (
            <div className="space-y-2">
              <Label className="text-foreground/80">Choose a friend</Label>
              {friendIds.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  Add friends first before creating an exchange.
                </p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder="Search your friends..."
                      className="pl-10 bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
                    />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {searchResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedUser(p);
                            setSearchResults([]);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors flex items-center justify-between"
                        >
                          <div>
                            <span className="font-medium text-foreground">{p.display_name || p.username || "User"}</span>
                            {p.username && <span className="text-muted-foreground text-sm ml-2">@{p.username}</span>}
                          </div>
                          <span className="text-xs font-bold text-primary">{p.trust_score ?? 60}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3">
              <div>
                <span className="font-medium text-foreground">{selectedUser.display_name || selectedUser.username}</span>
                {selectedUser.username && <span className="text-muted-foreground text-sm ml-2">@{selectedUser.username}</span>}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedUser(null)} className="text-muted-foreground hover:text-foreground">
                Change
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-foreground/80">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Lunch cover" className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground/80">Type</Label>
              <Select value={exchangeType} onValueChange={setExchangeType}>
                <SelectTrigger className="bg-secondary/50 border-glass-border/40 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-glass-border/40">
                  <SelectItem value="money">💰 Money</SelectItem>
                  <SelectItem value="favor">❤️ Favor</SelectItem>
                  <SelectItem value="item">📦 Item</SelectItem>
                  <SelectItem value="other">❓ Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground/80">Amount</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-foreground/80">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this about?" className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50 min-h-[60px]" />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground/80">Contract terms (optional)</Label>
            <Textarea value={contractTerms} onChange={(e) => setContractTerms(e.target.value)} placeholder="Any terms or conditions..." className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50 min-h-[60px]" />
          </div>

          <div className="space-y-2">
            <Label className="text-foreground/80">Due date (optional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="bg-secondary/50 border-glass-border/40 text-foreground" />
          </div>

          <Button
            type="submit"
            disabled={loading || !selectedUser || !title}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-semibold"
          >
            {loading ? "Creating..." : "Create Exchange"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreateExchangeDialog;
