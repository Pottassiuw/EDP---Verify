import React from 'react';
import { Separator } from '@/components/ui/separator';
import { formatRelativeTime } from '../format';
import type { NotaRevisao } from '../types';

function display(value: unknown): string {
  return (
    typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  )
    ? String(value)
    : '—';
}

const CURATED_FIELDS = new Set([
  'observacoes',
  'sintoma',
  'prioridade',
  'alimentador',
  'cidade',
  'tipo_local_instalacao',
  'local_instalacao_numero',
  'id_sap',
  'arquivado',
]);

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="edp-eyebrow">{title}</h2>
      <dl className="flex flex-col gap-2">{children}</dl>
    </section>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: unknown;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[minmax(112px,0.42fr)_1fr] gap-3 text-sm">
      <dt className="text-text-mute">{label}</dt>
      <dd className="edp-mono min-w-0 break-words">{display(value)}</dd>
    </div>
  );
}

interface NotaSummaryProps {
  revisao: NotaRevisao;
}

export function NotaSummary({ revisao }: NotaSummaryProps): React.JSX.Element {
  const fields = revisao.coffee.dados_json ?? {};
  const remainingFields = Object.entries(fields).filter(
    ([key]) => !CURATED_FIELDS.has(key),
  );

  return (
    <div className="flex flex-col gap-5">
      <SummarySection title="Identificação">
        <SummaryRow label="ID COFFEE" value={revisao.coffee.pk} />
        <SummaryRow label="ID SAP" value={revisao.coffee.id_sap} />
        <SummaryRow label="Classificação" value={revisao.coffee.classificacao} />
        <SummaryRow label="Origem" value={revisao.coffee.origem} />
        <SummaryRow label="Arquivada" value={revisao.coffee.arquivado} />
        <SummaryRow
          label="Última busca"
          value={formatRelativeTime(revisao.coffee.buscado_em)}
        />
      </SummarySection>
      <Separator />
      <SummarySection title="Local e rede">
        <SummaryRow label="Local" value={revisao.proposta.Local_Instalacao} />
        <SummaryRow label="Cidade" value={fields.cidade} />
        <SummaryRow label="Tipo de local" value={fields.tipo_local_instalacao} />
        <SummaryRow label="Nº do local" value={fields.local_instalacao_numero} />
        <SummaryRow label="Alimentador" value={fields.alimentador} />
        <SummaryRow label="Circuito" value={revisao.proposta.Circuito} />
      </SummarySection>
      <Separator />
      <SummarySection title="Atendimento">
        <SummaryRow label="Prioridade" value={fields.prioridade} />
        <SummaryRow label="Sintoma" value={fields.sintoma} />
        <SummaryRow label="Observações" value={fields.observacoes} />
        <SummaryRow
          label="Observação do plano"
          value={revisao.proposta.Observacao}
        />
        <SummaryRow label="Status inicial" value={revisao.proposta.Status_Nota} />
        <SummaryRow
          label="Planejado"
          value={`${revisao.proposta.Planejado_DDPM}${
            revisao.proposta.Planejado_Unidade
              ? ` ${revisao.proposta.Planejado_Unidade}`
              : ''
          }`}
        />
      </SummarySection>
      <Separator />
      <SummarySection title="Dados SAP (IW28)">
        <SummaryRow
          label="Extração"
          value={
            revisao.iw28_extraida_em
              ? formatRelativeTime(revisao.iw28_extraida_em)
              : null
          }
        />
        {revisao.iw28 ? (
          Object.entries(revisao.iw28).map(([key, value]) => (
            <SummaryRow key={key} label={key} value={value} />
          ))
        ) : (
          <SummaryRow label="Situação" value="Nota ausente da extração." />
        )}
      </SummarySection>
      {revisao.plano && (
        <>
          <Separator />
          <SummarySection title="Dados atuais do plano">
            {Object.entries(revisao.plano).map(([key, value]) => (
              <SummaryRow key={key} label={key} value={value} />
            ))}
          </SummarySection>
        </>
      )}
      {remainingFields.length > 0 && (
        <>
          <Separator />
          <SummarySection title="Demais dados do COFFEE">
            {remainingFields.map(([key, value]) => (
              <SummaryRow key={key} label={key} value={value} />
            ))}
          </SummarySection>
        </>
      )}
      {revisao.avisos.length > 0 && (
        <>
          <Separator />
          <section aria-labelledby="coffee-inspector-warnings">
            <h2 id="coffee-inspector-warnings" className="edp-eyebrow mb-2">
              Avisos
            </h2>
            <ul className="flex flex-col gap-1 text-sm text-amber">
              {revisao.avisos.map((aviso) => <li key={aviso}>{aviso}</li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
