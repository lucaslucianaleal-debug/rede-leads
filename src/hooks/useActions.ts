import { useState, useCallback } from "react";
import { executeAction } from "@/services/actions";

interface ActionState {
  inProgress: string | null;
  result: { actionId: string; success: boolean; message: string } | null;
}

export function useActions(unitId: string) {
  const [state, setState] = useState<ActionState>({ inProgress: null, result: null });

  const execute = useCallback(async (actionId: string) => {
    setState(prev => ({ ...prev, inProgress: actionId }));
    try {
      const result = await executeAction(actionId, unitId);
      setState({ inProgress: null, result: { actionId, ...result } });
      // auto-limpar mensagem após 4s
      setTimeout(() => {
        setState(prev => prev.result?.actionId === actionId ? { ...prev, result: null } : prev);
      }, 4000);
    } catch {
      setState({ inProgress: null, result: { actionId, success: false, message: "Erro inesperado." } });
    }
  }, [unitId]);

  const isLoading = (actionId: string) => state.inProgress === actionId;
  const resultFor = (actionId: string) =>
    state.result?.actionId === actionId ? state.result : null;

  return { execute, isLoading, resultFor, actionInProgress: state.inProgress };
}
