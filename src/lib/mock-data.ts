export type Colaborador = {
  id: string;
  nome: string;
  email: string;
  gpid: string;
  cargo: string;
  area: string;
  turno: "Manhã" | "Tarde" | "Noite";
  status: "Ativo" | "Inativo" | "Afastado";
  gestor: string;
};

export const colaboradores: Colaborador[] = [
  { id: "1", nome: "Ana Souza", email: "ana.souza@empresa.com", gpid: "GP10234", cargo: "Analista RH", area: "Recursos Humanos", turno: "Manhã", status: "Ativo", gestor: "Carla Mendes" },
  { id: "2", nome: "Bruno Lima", email: "bruno.lima@empresa.com", gpid: "GP10235", cargo: "Operador", area: "Produção", turno: "Tarde", status: "Ativo", gestor: "Diego Alves" },
  { id: "3", nome: "Carla Mendes", email: "carla.mendes@empresa.com", gpid: "GP10236", cargo: "Coordenadora", area: "Recursos Humanos", turno: "Manhã", status: "Ativo", gestor: "Eduarda Rocha" },
  { id: "4", nome: "Diego Alves", email: "diego.alves@empresa.com", gpid: "GP10237", cargo: "Supervisor", area: "Produção", turno: "Manhã", status: "Ativo", gestor: "Eduarda Rocha" },
  { id: "5", nome: "Eduarda Rocha", email: "eduarda.rocha@empresa.com", gpid: "GP10238", cargo: "Gerente", area: "Operações", turno: "Manhã", status: "Ativo", gestor: "—" },
  { id: "6", nome: "Felipe Costa", email: "felipe.costa@empresa.com", gpid: "GP10239", cargo: "Técnico", area: "Manutenção", turno: "Noite", status: "Afastado", gestor: "Diego Alves" },
  { id: "7", nome: "Gabriela Dias", email: "gabriela.dias@empresa.com", gpid: "GP10240", cargo: "Analista", area: "Financeiro", turno: "Manhã", status: "Ativo", gestor: "Eduarda Rocha" },
  { id: "8", nome: "Henrique Silva", email: "henrique.silva@empresa.com", gpid: "GP10241", cargo: "Operador", area: "Produção", turno: "Tarde", status: "Ativo", gestor: "Diego Alves" },
  { id: "9", nome: "Isabela Castro", email: "isabela.castro@empresa.com", gpid: "GP10242", cargo: "Analista TI", area: "Tecnologia", turno: "Manhã", status: "Ativo", gestor: "Eduarda Rocha" },
  { id: "10", nome: "João Pereira", email: "joao.pereira@empresa.com", gpid: "GP10243", cargo: "Operador", area: "Produção", turno: "Noite", status: "Inativo", gestor: "Diego Alves" },
];

export type Falta = {
  id: string;
  colaboradorId: string;
  data: string;
  motivo: "Atestado médico" | "Falta injustificada" | "Falta justificada" | "Atraso";
  periodo: "Integral" | "Manhã" | "Tarde";
};

export const faltas: Falta[] = [
  { id: "f1", colaboradorId: "2", data: "2026-04-14", motivo: "Atestado médico", periodo: "Integral" },
  { id: "f2", colaboradorId: "2", data: "2026-04-22", motivo: "Falta injustificada", periodo: "Integral" },
  { id: "f3", colaboradorId: "6", data: "2026-04-18", motivo: "Atestado médico", periodo: "Integral" },
  { id: "f4", colaboradorId: "8", data: "2026-04-29", motivo: "Falta justificada", periodo: "Manhã" },
  { id: "f5", colaboradorId: "10", data: "2026-04-30", motivo: "Falta injustificada", periodo: "Integral" },
  { id: "f6", colaboradorId: "2", data: "2026-05-02", motivo: "Atraso", periodo: "Manhã" },
  { id: "f7", colaboradorId: "7", data: "2026-05-03", motivo: "Atestado médico", periodo: "Integral" },
  { id: "f8", colaboradorId: "1", data: "2026-04-09", motivo: "Falta justificada", periodo: "Tarde" },
  { id: "f9", colaboradorId: "8", data: "2026-04-12", motivo: "Atestado médico", periodo: "Integral" },
];

export type Ferias = {
  id: string;
  colaboradorId: string;
  inicio: string;
  fim: string;
  status: "Planejada" | "Aprovada" | "Em gozo" | "Concluída";
  periodoAquisitivo: string;
};

export const ferias: Ferias[] = [
  { id: "v1", colaboradorId: "1", inicio: "2026-05-15", fim: "2026-06-03", status: "Aprovada", periodoAquisitivo: "2025/2026" },
  { id: "v2", colaboradorId: "3", inicio: "2026-05-08", fim: "2026-05-22", status: "Em gozo", periodoAquisitivo: "2025/2026" },
  { id: "v3", colaboradorId: "5", inicio: "2026-07-01", fim: "2026-07-30", status: "Planejada", periodoAquisitivo: "2025/2026" },
  { id: "v4", colaboradorId: "7", inicio: "2026-05-10", fim: "2026-05-30", status: "Aprovada", periodoAquisitivo: "2025/2026" },
  { id: "v5", colaboradorId: "9", inicio: "2026-06-12", fim: "2026-07-01", status: "Planejada", periodoAquisitivo: "2025/2026" },
];

export type Licenca = {
  id: string;
  colaboradorId: string;
  tipo: "Maternidade" | "Paternidade" | "Saúde" | "Sem vencimentos" | "Estudo";
  inicio: string;
  fim: string;
  status: "Ativa" | "Encerrada" | "Pendente";
  observacoes: string;
};

export const licencas: Licenca[] = [
  { id: "l1", colaboradorId: "6", tipo: "Saúde", inicio: "2026-03-01", fim: "2026-08-30", status: "Ativa", observacoes: "Cirurgia + recuperação" },
  { id: "l2", colaboradorId: "10", tipo: "Sem vencimentos", inicio: "2026-04-01", fim: "2026-06-30", status: "Ativa", observacoes: "Motivos pessoais" },
  { id: "l3", colaboradorId: "4", tipo: "Paternidade", inicio: "2026-02-10", fim: "2026-02-30", status: "Encerrada", observacoes: "—" },
];

export type Agendamento = {
  id: string;
  titulo: string;
  data: string;
  hora: string;
  colaboradorId: string;
  prioridade: "Baixa" | "Média" | "Alta";
};

export const agendamentos: Agendamento[] = [
  { id: "a1", titulo: "Retorno de afastamento", data: "2026-05-08", hora: "09:00", colaboradorId: "6", prioridade: "Alta" },
  { id: "a2", titulo: "Feedback semestral", data: "2026-05-12", hora: "14:30", colaboradorId: "2", prioridade: "Média" },
  { id: "a3", titulo: "Integração de novo gestor", data: "2026-05-15", hora: "10:00", colaboradorId: "5", prioridade: "Média" },
  { id: "a4", titulo: "Exame periódico", data: "2026-05-20", hora: "08:00", colaboradorId: "8", prioridade: "Baixa" },
];

export type Alerta = {
  id: string;
  tipo: "Absenteísmo" | "Férias" | "Licença" | "Cadastro";
  mensagem: string;
  criticidade: "Baixa" | "Média" | "Alta";
  data: string;
  acao: string;
};

export const alertas: Alerta[] = [
  { id: "al1", tipo: "Absenteísmo", mensagem: "Bruno Lima acumulou 3 faltas em 30 dias", criticidade: "Alta", data: "2026-05-03", acao: "Iniciar acompanhamento" },
  { id: "al2", tipo: "Férias", mensagem: "Eduarda Rocha tem férias vencendo em 60 dias", criticidade: "Média", data: "2026-05-01", acao: "Programar período" },
  { id: "al3", tipo: "Licença", mensagem: "Felipe Costa em licença há mais de 60 dias", criticidade: "Média", data: "2026-05-02", acao: "Revisar caso" },
  { id: "al4", tipo: "Cadastro", mensagem: "João Pereira sem gestor direto cadastrado", criticidade: "Baixa", data: "2026-04-28", acao: "Atualizar cadastro" },
  { id: "al5", tipo: "Absenteísmo", mensagem: "Área de Produção com taxa acima de 6%", criticidade: "Alta", data: "2026-05-04", acao: "Reunião com liderança" },
];

export type Tarefa = {
  id: string;
  titulo: string;
  responsavel: string;
  prazo: string;
  prioridade: "Baixa" | "Média" | "Alta";
  status: "A fazer" | "Em andamento" | "Concluída";
};

export const tarefas: Tarefa[] = [
  { id: "t1", titulo: "Validar atestados pendentes da semana", responsavel: "Ana Souza", prazo: "2026-05-07", prioridade: "Alta", status: "Em andamento" },
  { id: "t2", titulo: "Atualizar planilha de férias 2026", responsavel: "Carla Mendes", prazo: "2026-05-10", prioridade: "Média", status: "A fazer" },
  { id: "t3", titulo: "Revisar política de licenças", responsavel: "Eduarda Rocha", prazo: "2026-05-15", prioridade: "Média", status: "A fazer" },
  { id: "t4", titulo: "Enviar relatório de absenteísmo mensal", responsavel: "Ana Souza", prazo: "2026-05-05", prioridade: "Alta", status: "Concluída" },
  { id: "t5", titulo: "Cadastrar novos colaboradores de maio", responsavel: "Carla Mendes", prazo: "2026-05-12", prioridade: "Baixa", status: "A fazer" },
];

export const absenteismoSerie = [
  { mes: "Nov", taxa: 3.1 },
  { mes: "Dez", taxa: 3.6 },
  { mes: "Jan", taxa: 4.2 },
  { mes: "Fev", taxa: 3.8 },
  { mes: "Mar", taxa: 4.6 },
  { mes: "Abr", taxa: 5.1 },
  { mes: "Mai", taxa: 4.4 },
];

export const absenteismoPorArea = [
  { area: "Produção", taxa: 6.2 },
  { area: "Manutenção", taxa: 4.1 },
  { area: "RH", taxa: 2.0 },
  { area: "Financeiro", taxa: 1.8 },
  { area: "Tecnologia", taxa: 1.2 },
  { area: "Operações", taxa: 2.6 },
];

export const faltasPorMotivo = [
  { motivo: "Atestado", total: 18 },
  { motivo: "Justificada", total: 7 },
  { motivo: "Injustificada", total: 5 },
  { motivo: "Atraso", total: 9 },
];

export const getColaborador = (id: string) =>
  colaboradores.find((c) => c.id === id);
