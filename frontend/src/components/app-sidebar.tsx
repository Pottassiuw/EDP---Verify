import React from 'react';
import { ChartNoAxesCombined, ChevronDown } from 'lucide-react';
import type { AppSection, CoffeeSubPage, RelatoriosSubPage } from '../types';
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { COFFEE_SUBS } from '../features/coffee/subs';
import { INPUT_SUBS } from '../features/input/subs';
import { RELATORIOS_SUBS } from '../features/relatorios/subs';
import type { AbaInput } from '../features/input/types';

// ─── Ícones inline ────────────────────────────────────────────────────────────
const svgBase = {
  width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
};

const BrandGlyph = (): React.JSX.Element => (
  <svg width="24" height="24" viewBox="0 0 100 100" aria-hidden="true" style={{ flexShrink: 0 }}>
    <circle cx="50" cy="50" r="30" fill="none" stroke="var(--indigo)" strokeWidth="9" />
    <circle cx="50" cy="50" r="18" fill="none" stroke="var(--blue)" strokeWidth="9" />
    <circle cx="50" cy="50" r="7" fill="none" stroke="var(--green)" strokeWidth="9" />
  </svg>
);
const IconCoffee = (): React.JSX.Element => (
  <svg {...svgBase}><path d="M5 9h12v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" /><path d="M17 10h2.4a2.5 2.5 0 0 1 0 5H17" /><path d="M8 3c-.5 1 .5 1.6 0 2.6M12 3c-.5 1 .5 1.6 0 2.6" /></svg>
);
const IconInput = (): React.JSX.Element => (
  <svg {...svgBase}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></svg>
);
const IconBI = (): React.JSX.Element => (
  <svg {...svgBase}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
);
const IconGear = (): React.JSX.Element => (
  <svg {...svgBase}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H2a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 8a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V2a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H22a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);

/** Item de seção com subs colapsáveis. O nome de grupo `group/nav` é o mesmo
 *  nas três instâncias: o escopo do Tailwind é por ancestral, então irmãos
 *  não interferem entre si. */
function SidebarNavGroup<T extends string>({ icon, label, active, onSelect, subs, activeSub, onSelectSub }: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onSelect: () => void;
  subs: { id: T; rotulo: string }[];
  activeSub: T;
  onSelectSub: (sub: T) => void;
}): React.JSX.Element {
  return (
    <SidebarMenuItem>
      <Collapsible defaultOpen className="group/nav">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={label} isActive={active} onClick={onSelect}>
            {icon}
            <span>{label}</span>
            <ChevronDown
              size={14}
              className="ml-auto transition-transform duration-200 group-data-[state=open]/nav:rotate-180"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {subs.map((s) => (
              <SidebarMenuSubItem key={s.id}>
                <SidebarMenuSubButton
                  className="cursor-pointer"
                  isActive={active && activeSub === s.id}
                  onClick={() => onSelectSub(s.id)}
                >
                  {s.rotulo}
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  );
}

interface AppSidebarProps {
  section: AppSection;
  setSection: (s: AppSection) => void;
  coffeeSub: CoffeeSubPage;
  setCoffeeSub: (s: CoffeeSubPage) => void;
  inputSub: AbaInput;
  setInputSub: (s: AbaInput) => void;
  relatoriosSub: RelatoriosSubPage;
  setRelatoriosSub: (s: RelatoriosSubPage) => void;
}

export function AppSidebar({ section, setSection, coffeeSub, setCoffeeSub, inputSub, setInputSub, relatoriosSub, setRelatoriosSub }: AppSidebarProps): React.JSX.Element {
  function irPara<T>(setSub: (s: T) => void, alvo: AppSection): (sub: T) => void {
    return (sub) => { setSub(sub); setSection(alvo); };
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-1 py-1 group-data-[collapsible=icon]:px-0">
              <span className="flex items-center group-data-[collapsible=icon]:hidden">
                <BrandGlyph />
              </span>
              <span className="font-semibold text-sm truncate group-data-[collapsible=icon]:hidden">
                EDP Verify
              </span>
              <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:mx-auto" />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Plataforma</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarNavGroup
              icon={<ChartNoAxesCombined size={16} />}
              label="Relatórios"
              active={section === "relatorios"}
              onSelect={() => setSection("relatorios")}
              subs={RELATORIOS_SUBS}
              activeSub={relatoriosSub}
              onSelectSub={irPara(setRelatoriosSub, "relatorios")}
            />
            <SidebarNavGroup
              icon={<IconCoffee />}
              label="COFFEE"
              active={section === "coffee"}
              onSelect={() => setSection("coffee")}
              subs={COFFEE_SUBS}
              activeSub={coffeeSub}
              onSelectSub={irPara(setCoffeeSub, "coffee")}
            />
            <SidebarNavGroup
              icon={<IconInput />}
              label="Input"
              active={section === "input"}
              onSelect={() => setSection("input")}
              subs={INPUT_SUBS}
              activeSub={inputSub}
              onSelectSub={irPara(setInputSub, "input")}
            />

            <SidebarMenuItem>
              <SidebarMenuButton disabled className="opacity-40">
                <IconBI />
                <span>De olho no BI</span>
                <span className="ml-auto text-[9px] group-data-[collapsible=icon]:hidden">soon</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Separator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Configurações"
              isActive={section === "configuracoes"}
              onClick={() => setSection("configuracoes")}
            >
              <IconGear />
              <span>Configurações</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
