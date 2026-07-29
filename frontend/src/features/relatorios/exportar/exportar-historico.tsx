import React from 'react';
import { ArchiveX } from 'lucide-react';

import { TituloPainel } from '../relatorios-ui';

export function ExportarHistorico(): React.JSX.Element {
  return (
    <section className="edp-panel flex max-w-3xl flex-col gap-4">
      <TituloPainel
        titulo="Histórico de pacotes"
        detalhe="O histórico será preenchido quando a geração consolidada estiver disponível."
      />
      <div className="flex items-center gap-3 rounded-edp border border-dashed border-line-2 bg-bg-2 p-5 text-sm text-text-mute">
        <ArchiveX className="size-5 text-text-mute" aria-hidden="true" />
        Nenhum pacote gerado nesta sessão.
      </div>
    </section>
  );
}
