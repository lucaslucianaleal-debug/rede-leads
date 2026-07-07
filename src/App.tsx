import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import { useClinics } from "@/hooks/useClinics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import SorteioCupons from "./pages/SorteioCupons";
import VisitaComercial from "./pages/VisitaComercial";
import Promotora from "./pages/Promotora";
import MPCToolPage from "./pages/MPCToolPage";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading, currentClinic, setSelectedClinic, userProfile } = useAuth();
  const { clinics } = useClinics();

  const rawClinicValues = userProfile
    ? [
        ...(userProfile.clinicId ? [userProfile.clinicId] : []),
        ...(Array.isArray(userProfile.clinicIds) ? userProfile.clinicIds : []),
        ...(Array.isArray(userProfile.clinics) ? userProfile.clinics : []),
      ]
    : [];
  const normalizedClinicValues = rawClinicValues
    .filter(Boolean)
    .map((v: any) => String(v).trim());
  const hasWildcardAccess = normalizedClinicValues.includes("*");
  const explicitClinicIds = Array.from(new Set(normalizedClinicValues.filter((v: string) => v !== "*")));
  const uniqueClinicIds = hasWildcardAccess
    ? clinics.map((c) => c.id)
    : explicitClinicIds;
  const needsClinicSelection = !!user && !currentClinic && uniqueClinicIds.length > 1;

  // Public routes — no auth required
  if (window.location.pathname === "/sorteio-cupons" || window.location.pathname === "/visita-comercial" || window.location.pathname === "/promotora") {
    return (
      <Routes>
        <Route path="/sorteio-cupons" element={<SorteioCupons />} />
        <Route path="/visita-comercial" element={<VisitaComercial />} />
        <Route path="/promotora" element={<Promotora />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg animate-pulse">Carregando...</div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  if (needsClinicSelection) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-slate-700 bg-slate-800/90 text-white">
          <CardHeader>
            <CardTitle>Escolha o Acesso</CardTitle>
            <CardDescription className="text-slate-300">
              Você possui mais de uma conta vinculada. Selecione onde deseja entrar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {uniqueClinicIds.map((clinicId) => {
              const clinic = clinics.find((c) => c.id === clinicId);
              const label = clinic?.name || clinicId;
              return (
                <Button
                  key={clinicId}
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => setSelectedClinic(clinicId)}
                >
                  {label}
                </Button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/mpc-tool" element={<MPCToolPage />} />
      <Route path="/sorteio-cupons" element={<SorteioCupons />} />
      <Route path="/visita-comercial" element={<VisitaComercial />} />
      <Route path="/promotora" element={<Promotora />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

