import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import meloLogo from "@/assets/melo-logo.png";

const MIN_AGE = 13;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const RATE_KEY = "melo_auth_rate";

interface RateLimitData { attempts: number; lockedUntil: number | null; }

function getRateLimit(): RateLimitData {
  try {
    const raw = localStorage.getItem(RATE_KEY);
    return raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: null };
  } catch { return { attempts: 0, lockedUntil: null }; }
}

function recordFailedAttempt(): RateLimitData {
  const data = getRateLimit();
  const attempts = data.attempts + 1;
  const lockedUntil = attempts >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : null;
  const next = { attempts, lockedUntil };
  localStorage.setItem(RATE_KEY, JSON.stringify(next));
  return next;
}

function resetRateLimit() { localStorage.removeItem(RATE_KEY); }

function getLockoutRemaining(): number {
  const data = getRateLimit();
  if (data.lockedUntil && Date.now() < data.lockedUntil) return data.lockedUntil - Date.now();
  if (data.lockedUntil) resetRateLimit();
  return 0;
}

function friendlyAuthError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("network"))
    return "No internet connection. Please check your connection and try again.";
  if (msg.includes("Invalid login credentials")) return "Email or password is incorrect.";
  if (msg.includes("Email not confirmed")) return "Please confirm your email address before signing in. Check your inbox.";
  if (msg.includes("User already registered") || msg.includes("already been registered"))
    return "An account with this email already exists. Try signing in instead.";
  if (msg.includes("Password should be at least")) return "Password does not meet the requirements.";
  if (msg.includes("Unable to validate email address") || msg.includes("invalid email"))
    return "Please enter a valid email address.";
  if (msg.includes("signup_disabled")) return "New sign-ups are currently disabled.";
  if (msg.includes("too many requests") || msg.includes("rate limit"))
    return "Too many attempts. Please wait a moment and try again.";
  if (msg.includes("Email rate limit exceeded"))
    return "Too many emails sent. Please wait before trying again.";
  if (msg.includes("duplicate") || msg.includes("already exists"))
    return "This username is already taken. Please choose another.";
  return msg.length < 120 ? msg : "Something went wrong. Please try again.";
}

function isOldEnough(birthday: string): boolean {
  const dob = new Date(birthday);
  const today = new Date();
  const age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const dayDiff = today.getDate() - dob.getDate();
  return (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age) >= MIN_AGE;
}

function validatePassword(pw: string) {
  return {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  };
}

function isPasswordValid(pw: string) {
  const v = validatePassword(pw);
  return v.length && v.upper && v.number && v.symbol;
}

const PasswordRule = ({ met, label }: { met: boolean; label: string }) => (
  <div className={`flex items-center gap-1.5 text-xs ${met ? "text-neon-green" : "text-muted-foreground/60"}`}>
    {met ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
    {label}
  </div>
);

const Auth = () => {
  const [mode, setMode] = useState<"login" | "signup" | "forgot-password" | "forgot-username">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(() => getLockoutRemaining());
  const [resetSent, setResetSent] = useState(false);
  const [usernameSent, setUsernameSent] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const interval = setInterval(() => {
      const remaining = getLockoutRemaining();
      setLockoutRemaining(remaining);
      if (remaining <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutRemaining]);

  const resetAll = () => {
    setEmail(""); setPassword(""); setConfirmPassword("");
    setFirstName(""); setLastName(""); setPhone("");
    setBirthday(""); setUsername("");
    setShowPassword(false); setShowConfirm(false);
    setResetSent(false); setUsernameSent(false);
  };

  const formatLockout = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Enter your email address"); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=reset`,
    });
    setLoading(false);
    if (error) {
      toast.error(friendlyAuthError(error));
    } else {
      setResetSent(true);
    }
  };

  const handleForgotUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Enter your email address"); return; }
    setLoading(true);
    // Look up the profile by auth user email via a server-side check
    // We can't directly query auth.users from the client, so we send a magic link
    // and the user will see their username in their profile after login
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/profile` },
    });
    setLoading(false);
    if (error) {
      toast.error(friendlyAuthError(error));
    } else {
      setUsernameSent(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "login") {
      const remaining = getLockoutRemaining();
      if (remaining > 0) {
        toast.error(`Too many failed attempts. Try again in ${formatLockout(remaining)}.`);
        return;
      }
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        const next = recordFailedAttempt();
        if (next.lockedUntil) {
          setLockoutRemaining(getLockoutRemaining());
          toast.error(`Too many failed attempts. Try again in ${formatLockout(LOCKOUT_MS)}.`);
        } else {
          const left = MAX_ATTEMPTS - next.attempts;
          toast.error(`${friendlyAuthError(error)} ${left} attempt${left !== 1 ? "s" : ""} remaining.`);
        }
      } else {
        resetRateLimit();
        navigate("/dashboard");
      }
      setLoading(false);
      return;
    }

    // Sign up validation
    if (!firstName.trim()) { toast.error("First name is required"); return; }
    if (!lastName.trim()) { toast.error("Last name is required"); return; }
    if (!username.trim()) { toast.error("Username is required"); return; }
    if (username.length < 3 || username.length > 30) { toast.error("Username must be 3–30 characters"); return; }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) { toast.error("Username can only contain letters, numbers, and underscores"); return; }

    if (!isPasswordValid(password)) {
      toast.error("Password does not meet all requirements");
      return;
    }
    if (password !== confirmPassword) { toast.error("Passwords do not match"); return; }
    if (!birthday) { toast.error("Date of birth is required"); return; }
    if (!isOldEnough(birthday)) { toast.error(`You must be at least ${MIN_AGE} years old to use Melo`); return; }

    setLoading(true);

    // Check if username is already taken
    const { data: existingUsername } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("username", username.trim().toLowerCase())
      .maybeSingle();

    if (existingUsername) {
      toast.error("This username is already taken. Please choose another.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          birthday,
          username: username.trim().toLowerCase(),
        },
      },
    });

    if (error) {
      toast.error(friendlyAuthError(error));
    } else {
      toast.success("Check your email to confirm your account!", { duration: 6000 });
      setMode("login");
      resetAll();
    }
    setLoading(false);
  };

  const maxBirthday = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - MIN_AGE);
    return d.toISOString().split("T")[0];
  })();

  const pwRules = validatePassword(password);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background gradient-mesh p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl neon-glow mb-4 overflow-hidden"
          >
            <img src={meloLogo} alt="Melo" className="w-full h-full object-cover" />
          </motion.div>
          <h1 className="text-3xl font-bold neon-text text-primary">Melo</h1>
          <p className="text-muted-foreground mt-2">
            {mode === "login" && "Welcome back"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot-password" && "Reset your password"}
            {mode === "forgot-username" && "Recover your username"}
          </p>
        </div>

        <div className="glass rounded-2xl p-8 neon-glow">

          {/* FORGOT PASSWORD */}
          {mode === "forgot-password" && (
            <>
              {resetSent ? (
                <div className="text-center space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-neon-green mx-auto" />
                  <p className="text-foreground font-medium">Password reset email sent!</p>
                  <p className="text-sm text-muted-foreground">Check your inbox for a link to reset your password.</p>
                  <Button variant="ghost" onClick={() => { setMode("login"); resetAll(); }} className="text-primary">
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-foreground/80">Email address</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-semibold">
                    {loading ? "Sending..." : "Send reset link"} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <div className="text-center">
                    <button type="button" onClick={() => { setMode("login"); resetAll(); }} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                      Back to sign in
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* FORGOT USERNAME */}
          {mode === "forgot-username" && (
            <>
              {usernameSent ? (
                <div className="text-center space-y-4">
                  <CheckCircle2 className="w-12 h-12 text-neon-green mx-auto" />
                  <p className="text-foreground font-medium">Magic link sent!</p>
                  <p className="text-sm text-muted-foreground">Click the link in your email to sign in — your username will be visible in your profile.</p>
                  <Button variant="ghost" onClick={() => { setMode("login"); resetAll(); }} className="text-primary">
                    Back to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleForgotUsername} className="space-y-4">
                  <p className="text-sm text-muted-foreground">Enter your email and we'll send you a magic link to sign in. Your username will be shown in your profile.</p>
                  <div className="space-y-2">
                    <Label className="text-foreground/80">Email address</Label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-semibold">
                    {loading ? "Sending..." : "Send magic link"} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                  <div className="text-center">
                    <button type="button" onClick={() => { setMode("login"); resetAll(); }} className="text-sm text-muted-foreground hover:text-primary transition-colors">
                      Back to sign in
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* LOGIN / SIGNUP */}
          {(mode === "login" || mode === "signup") && (
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Sign-up only fields */}
              <AnimatePresence initial={false}>
                {mode === "signup" && (
                  <motion.div
                    key="signup-fields"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4 overflow-hidden"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="firstName" className="text-foreground/80">First Name *</Label>
                        <Input id="firstName" type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" required className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName" className="text-foreground/80">Last Name *</Label>
                        <Input id="lastName" type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" required className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-foreground/80">Username *</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                        <Input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase())} placeholder="your_handle" required maxLength={30} className="pl-7 bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
                      </div>
                      <p className="text-xs text-muted-foreground/60">3–30 characters, letters, numbers, underscores only</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-foreground/80">Phone Number</Label>
                      <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="birthday" className="text-foreground/80">Date of Birth * <span className="text-muted-foreground text-xs">(13+)</span></Label>
                      <Input id="birthday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} max={maxBirthday} required className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground/80">Email *</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" required className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50" />
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground/80">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="pr-10 bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
                  />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {mode === "signup" && password.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    <PasswordRule met={pwRules.length} label="8+ characters" />
                    <PasswordRule met={pwRules.upper} label="Uppercase letter" />
                    <PasswordRule met={pwRules.number} label="Number" />
                    <PasswordRule met={pwRules.symbol} label="Symbol (!@#...)" />
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <AnimatePresence initial={false}>
                {mode === "signup" && (
                  <motion.div
                    key="confirm-password"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-2 overflow-hidden"
                  >
                    <Label htmlFor="confirmPassword" className="text-foreground/80">Confirm Password *</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className={`pr-10 bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50 ${confirmPassword && confirmPassword !== password ? "border-destructive/50" : ""}`}
                      />
                      <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== password && (
                      <p className="text-xs text-destructive">Passwords do not match</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <Button
                type="submit"
                disabled={loading || (mode === "login" && lockoutRemaining > 0)}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-semibold disabled:opacity-50"
              >
                {loading ? "Loading..."
                  : mode === "login" && lockoutRemaining > 0 ? `Try again in ${formatLockout(lockoutRemaining)}`
                  : mode === "login" ? "Sign In"
                  : "Create Account"}
                {!(mode === "login" && lockoutRemaining > 0) && <ArrowRight className="w-4 h-4 ml-2" />}
              </Button>

              {/* Forgot links — login only */}
              {mode === "login" && (
                <div className="flex justify-between text-xs pt-1">
                  <button type="button" onClick={() => { setMode("forgot-username"); resetAll(); }} className="text-muted-foreground hover:text-primary transition-colors">
                    Forgot username?
                  </button>
                  <button type="button" onClick={() => { setMode("forgot-password"); resetAll(); }} className="text-muted-foreground hover:text-primary transition-colors">
                    Forgot password?
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Toggle login/signup */}
          {(mode === "login" || mode === "signup") && (
            <div className="mt-6 text-center">
              <button
                onClick={() => { setMode(mode === "login" ? "signup" : "login"); resetAll(); }}
                className="text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
