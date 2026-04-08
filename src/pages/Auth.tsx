import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight } from "lucide-react";
import meloLogo from "@/assets/melo-logo.png";

const MIN_AGE = 13;
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
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
  if (data.lockedUntil) resetRateLimit(); // expired
  return 0;
}

function friendlyAuthError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);

  // Network failures
  if (msg === "Failed to fetch" || msg.includes("NetworkError") || msg.includes("network")) {
    return "No internet connection. Please check your connection and try again.";
  }

  // Supabase auth error messages
  if (msg.includes("Invalid login credentials")) return "Email or password is incorrect.";
  if (msg.includes("Email not confirmed")) return "Please confirm your email before signing in.";
  if (msg.includes("User already registered")) return "An account with this email already exists.";
  if (msg.includes("Password should be at least")) return "Password must be at least 6 characters.";
  if (msg.includes("Unable to validate email address")) return "Please enter a valid email address.";
  if (msg.includes("signup_disabled")) return "Sign ups are currently disabled.";
  if (msg.includes("too many requests") || msg.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  if (msg.includes("Email rate limit exceeded")) return "Too many emails sent. Please wait before trying again.";

  // Fallback — show the real message if it's readable, else generic
  return msg.length < 120 ? msg : "Something went wrong. Please try again.";
}

function isOldEnough(birthday: string): boolean {
  const dob = new Date(birthday);
  const today = new Date();
  const age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  const dayDiff = today.getDate() - dob.getDate();
  const adjustedAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
  return adjustedAge >= MIN_AGE;
}

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(() => getLockoutRemaining());
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

  const resetSignupFields = () => {
    setConfirmPassword("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setBirthday("");
  };

  const handleToggle = () => {
    setIsLogin((v) => !v);
    resetSignupFields();
  };

  const formatLockout = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLogin) {
      const remaining = getLockoutRemaining();
      if (remaining > 0) {
        toast.error(`Too many failed attempts. Try again in ${formatLockout(remaining)}.`);
        return;
      }
    }

    setLoading(true);

    if (isLogin) {
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
    } else {
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        setLoading(false);
        return;
      }

      if (password.length < 6) {
        toast.error("Password must be at least 6 characters");
        setLoading(false);
        return;
      }

      if (!birthday) {
        toast.error("Please enter your date of birth");
        setLoading(false);
        return;
      }

      if (!isOldEnough(birthday)) {
        toast.error(`You must be at least ${MIN_AGE} years old to use Melo`);
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
          },
        },
      });

      if (error) {
        toast.error(friendlyAuthError(error));
      } else {
        toast.success("Check your email to confirm your account!");
      }
    }

    setLoading(false);
  };

  // Max date allowed = today minus 13 years
  const maxBirthday = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - MIN_AGE);
    return d.toISOString().split("T")[0];
  })();

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
            {isLogin ? "Welcome back" : "Create your account"}
          </p>
        </div>

        <div className="glass rounded-2xl p-8 neon-glow">
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Sign-up only fields */}
            <AnimatePresence initial={false}>
              {!isLogin && (
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
                      <Label htmlFor="firstName" className="text-foreground/80">First Name</Label>
                      <Input
                        id="firstName"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="Jane"
                        required={!isLogin}
                        className="bg-secondary/50 border-glass-border/40 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-foreground/80">Last Name</Label>
                      <Input
                        id="lastName"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Doe"
                        required={!isLogin}
                        className="bg-secondary/50 border-glass-border/40 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-foreground/80">Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+1 (555) 000-0000"
                      required={!isLogin}
                      className="bg-secondary/50 border-glass-border/40 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="birthday" className="text-foreground/80">
                      Date of Birth <span className="text-muted-foreground text-xs">(must be 13+)</span>
                    </Label>
                    <Input
                      id="birthday"
                      type="date"
                      value={birthday}
                      onChange={(e) => setBirthday(e.target.value)}
                      max={maxBirthday}
                      required={!isLogin}
                      className="bg-secondary/50 border-glass-border/40 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Shared fields */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground/80">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                required
                className="bg-secondary/50 border-glass-border/40 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground/80">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="bg-secondary/50 border-glass-border/40 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
              />
            </div>

            <AnimatePresence initial={false}>
              {!isLogin && (
                <motion.div
                  key="confirm-password"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-2 overflow-hidden"
                >
                  <Label htmlFor="confirmPassword" className="text-foreground/80">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    required={!isLogin}
                    minLength={6}
                    className="bg-secondary/50 border-glass-border/40 focus:border-primary/50 text-foreground placeholder:text-muted-foreground/50"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={loading || (isLogin && lockoutRemaining > 0)}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-semibold disabled:opacity-50"
            >
              {loading
                ? "Loading..."
                : isLogin && lockoutRemaining > 0
                ? `Try again in ${formatLockout(lockoutRemaining)}`
                : isLogin
                ? "Sign In"
                : "Create Account"}
              {!(isLogin && lockoutRemaining > 0) && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={handleToggle}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Auth;
