import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Package, Layers, Wallet, BarChart3, CheckCircle, AlertTriangle, ArrowRight } from "lucide-react";

const modes = [
  {
    key: "drape",
    title: "Saree AI Drape",
    description: "Generate an AI model elegantly wearing your saree design",
    icon: User,
  },
  {
    key: "folded",
    title: "Folded Saree AI Image",
    description: "Create a beautiful folded saree product display",
    icon: Package,
  },
  {
    key: "fleeted",
    title: "Pleated Saree AI Image",
    description: "Create a premium pleated showroom-style saree display",
    icon: Layers,
  },
];

const Index = () => {
  const navigate = useNavigate();
  const { organization, walletBalance } = useOrganization();

  const [usageThisMonth, setUsageThisMonth] = useState<{ total: number; success: number } | null>(null);

  useEffect(() => {
    if (!organization) return;
    const fetchUsage = async () => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data } = await supabase
        .from("usage_logs")
        .select("status")
        .eq("organization_id", organization.id)
        .gte("created_at", startOfMonth);
      if (data) {
        setUsageThisMonth({
          total: data.length,
          success: data.filter((d) => d.status === "success").length,
        });
      }
    };
    fetchUsage();
  }, [organization?.id]);

  const balanceLow = walletBalance !== null && walletBalance <= 50;
  const balanceWarning = walletBalance !== null && walletBalance > 50 && walletBalance < 200;

  return (
    <div className="space-y-8">
      {/* Quick stats bar */}
      {organization && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Wallet balance */}
          <Link to="/wallet">
            <Card className={`border transition-colors hover:shadow-md cursor-pointer ${
              balanceLow ? "border-destructive/50 bg-destructive/5" :
              balanceWarning ? "border-amber-500/40 bg-amber-500/5" :
              "border-border/50 hover:border-primary/30"
            }`}>
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`p-3 rounded-xl shrink-0 ${
                  balanceLow ? "bg-destructive/10" :
                  balanceWarning ? "bg-amber-500/10" :
                  "bg-primary/10"
                }`}>
                  {balanceLow
                    ? <AlertTriangle className="h-6 w-6 text-destructive" />
                    : <Wallet className={`h-6 w-6 ${balanceWarning ? "text-amber-500" : "text-primary"}`} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">Wallet Balance</p>
                  <p className={`text-2xl font-bold font-serif ${
                    balanceLow ? "text-destructive" :
                    balanceWarning ? "text-amber-500" :
                    "text-foreground"
                  }`}>
                    {walletBalance !== null ? `₹${walletBalance.toFixed(2)}` : "—"}
                  </p>
                  {balanceLow && (
                    <p className="text-xs text-destructive font-medium mt-0.5">
                      Low — contact your administrator to recharge
                    </p>
                  )}
                  {balanceWarning && (
                    <p className="text-xs text-amber-600 font-medium mt-0.5">
                      Running low
                    </p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>

          {/* This month's usage */}
          <Link to="/usage">
            <Card className="border border-border/50 hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-accent/10 shrink-0">
                  <BarChart3 className="h-6 w-6 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-0.5">This Month</p>
                  <p className="text-2xl font-bold font-serif text-foreground">
                    {usageThisMonth !== null ? usageThisMonth.total : "—"}
                    <span className="text-sm font-normal text-muted-foreground ml-1">generations</span>
                  </p>
                  {usageThisMonth !== null && usageThisMonth.total > 0 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <CheckCircle className="h-3 w-3 text-accent" />
                      <p className="text-xs text-muted-foreground">
                        {usageThisMonth.success} successful
                      </p>
                    </div>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        </div>
      )}

      {/* Mode selection */}
      <div className="space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-3xl font-serif font-bold text-foreground">
            What would you like to create?
          </h1>
          <p className="text-muted-foreground">
            Choose a generation mode to get started
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modes.map(({ key, title, description, icon: Icon }) => (
            <Card
              key={key}
              className={`border-border/50 cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all duration-200 group ${
                balanceLow ? "opacity-60" : ""
              }`}
              onClick={() => {
                if (balanceLow) return;
                navigate(`/generate?mode=${key}`);
              }}
            >
              <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
                <div className="p-4 rounded-2xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Icon className="h-10 w-10 text-primary" />
                </div>
                <h2 className="text-xl font-serif font-bold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">{description}</p>
                {balanceLow && (
                  <Badge variant="destructive" className="text-xs">Insufficient balance</Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Index;
