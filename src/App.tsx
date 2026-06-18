import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth, AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import SorteioCupons from "./pages/SorteioCupons";
import VisitaComercial from "./pages/VisitaComercial";
import Promotora from "./pages/Promotora";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();

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

  return (
    <Routes>
      <Route path="/" element={<Index />} />
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

