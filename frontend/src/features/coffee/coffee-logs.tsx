import React from 'react';
import { useCoffeeLogs } from './use-coffee-logs';
import { LogTable, PASSOS, agruparLogs } from './coffee-log-table';
import { BASE as API_BASE } from '../../api';
import { Eyebrow, SegTabs, StatTile } from '@/components/branded/section';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const LIMITES = [50, 100, 500] as const;

const PERIODOS = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "7 dias" },
  { id: "30d", rotulo: "30 dias" },
  { id: "tudo", rotulo: "Tudo" },
] as const;
type Periodo = (typeof PERIODOS)[number]["id"];

function isoLocal(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function sinceDe(periodo: Periodo): string | undefined {
  if (periodo === "tudo") return undefined;
  const d = new Date();
  if (periodo === "hoje") d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - (periodo === "7d" ? 7 : 30));
  return isoLocal(d);
}

export function CoffeeLogs(): React.JSX.Element {
  const [passo, setPasso] = React.useState("todos");
  const [notaPk, setNotaPk] = React.useState("");
  const [limit, setLimit] = React.useState<number>(100);
  const [usuario, setUsuario] = React.useState("");
  const [usuarios, setUsuarios] = React.useState<string[]>([]);

  React.useEffect(() => {
    fetch(`${API_BASE}/coffee/logs/usuarios`, { headers: { Accept: "application/json" } })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data: { usuarios: string[] }) => setUsuarios(data.usuarios))
      .catch(() => {});
  }, []);

  const [periodo, setPeriodo] = React.useState<Periodo>("7d");
  const [aoVivo, setAoVivo] = React.useState(false);

  const parsedPk = notaPk.trim() ? Number(notaPk) : undefined;
  const pkValido = Number.isFinite(parsedPk) ? parsedPk : undefined;
  const { logs, loading, refresh } = useCoffeeLogs({
    nota_pk: pkValido,
    usuario: usuario || undefined,
    limit,
    since: sinceDe(periodo),
  });

  React.useEffect(() => {
    if (!aoVivo) return;
    const t = window.setInterval(refresh, 10_000);
    return () => window.clearInterval(t);
  }, [aoVivo, refresh]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="shrink-0 pt-[14px] px-[22px] pb-[10px] flex items-center gap-[14px] flex-wrap">
        <SegTabs tabs={PASSOS.map((p) => ({ id: p.value, rotulo: p.label }))}
                 value={passo} onChange={setPasso} ariaLabel="Filtrar por passo" />

        <div className="flex items-center gap-[6px]">
          <label className="text-[12px] text-text-dim">Nota:</label>
          <Input type="number" placeholder="PK" value={notaPk} className="font-mono w-[90px] h-[30px] text-[12px] "
                 onChange={(e) => setNotaPk(e.target.value)} />
        </div>

        <div className="flex items-center gap-[6px]">
          <label className="text-[12px] text-text-dim">Usuario:</label>
          <Select value={usuario || "__todos"} onValueChange={(v) => setUsuario(v === "__todos" ? "" : v)}>
            <SelectTrigger className="font-mono h-[30px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos">Todos</SelectItem>
              {usuarios.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-[6px]">
          <label className="text-[12px] text-text-dim">Limite:</label>
          <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
            <SelectTrigger className="h-[30px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIMITES.map((l) => <SelectItem key={l} value={String(l)}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-[6px]">
          <label className="text-[12px] text-text-dim">Período:</label>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="h-[30px] text-[12px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODOS.map((p) => <SelectItem key={p.id} value={p.id}>{p.rotulo}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-[8px]">
          <Switch id="logs-ao-vivo" checked={aoVivo} onCheckedChange={setAoVivo} />
          <label htmlFor="logs-ao-vivo" className="text-[12px] cursor-pointer"
                 style={{ color: aoVivo ? "var(--green)" : "var(--text-mute)" }}>
            Ao vivo
          </label>
        </div>
      </div>

      <div className="shrink-0 pt-0 px-[22px] pb-[12px] flex flex-col gap-[6px]">
        <Eyebrow>No período carregado</Eyebrow>
        <div className="flex gap-[10px] flex-wrap">
          <StatTile label="Ações" value={agruparLogs(logs).length} />
          <StatTile label="Falhas" value={logs.filter((l) => !l.sucesso).length} />
          <StatTile label="Notas tocadas" value={new Set(logs.map((l) => l.nota_pk).filter((p) => p !== null)).size} />
        </div>
      </div>

      <LogTable logs={logs} loading={loading} passo={passo} notaRoot={pkValido}
                onClickNota={(pk) => setNotaPk(String(pk))} />
    </div>
  );
}
