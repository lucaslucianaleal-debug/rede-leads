import React from "react";

export type ActionCommand = {
  acao: string;
  cliente: string;
  clienteLink?: string;
  motivo: string;
  tempo: string;
  nivel: "URGENTE" | "PRIORITÁRIO" | "ROTINA";
};

export const ActionCommandCard: React.FC<{ command: ActionCommand }> = ({ command }) => {
  const color =
    command.nivel === "URGENTE"
      ? "border-rose-500 bg-rose-50"
      : command.nivel === "PRIORITÁRIO"
      ? "border-amber-500 bg-amber-50"
      : "border-emerald-500 bg-emerald-50";
  return (
    <div className={`p-4 rounded-xl border-2 shadow-lg flex flex-col gap-2 mb-2 ${color}`}>
      <div className="flex items-center gap-3">
        <span className={`w-3 h-3 rounded-full ${
          command.nivel === "URGENTE"
            ? "bg-rose-500"
            : command.nivel === "PRIORITÁRIO"
            ? "bg-amber-500"
            : "bg-emerald-500"
        }`} />
        <span className="text-xs font-bold tracking-widest uppercase">{command.nivel}</span>
      </div>
      <div className="text-lg font-extrabold text-foreground">{command.acao}</div>
      <div className="text-base font-semibold">
        Cliente: {command.clienteLink ? (
          <a href={command.clienteLink} target="_blank" rel="noopener noreferrer" className="underline text-primary">{command.cliente}</a>
        ) : (
          command.cliente
        )}
      </div>
      <div className="text-sm text-muted-foreground">Motivo: {command.motivo}</div>
      <div className="text-xs text-muted-foreground">Prazo: <span className="font-semibold text-foreground">{command.tempo}</span></div>
    </div>
  );
};

export default ActionCommandCard;
