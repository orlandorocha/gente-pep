export type Motivo = { id: number; descricao: string };

export const MOTIVOS: Motivo[] = [
  { id: 1, descricao: "Falta" },
  { id: 2, descricao: "Afastamento Médico" },
  { id: 3, descricao: "Licença Maternidade" },
  { id: 4, descricao: "Licença Paternidade" },
  { id: 5, descricao: "Licença Remunerada" },
  { id: 6, descricao: "Casamento" },
  { id: 7, descricao: "Declarações" },
  { id: 8, descricao: "Audiência" },
  { id: 9, descricao: "Aniversário" },
  { id: 10, descricao: "Curso / Aprendiz" },
  { id: 11, descricao: "Férias" },
  { id: 12, descricao: "De Bem Com a Vida" },
  { id: 13, descricao: "Folga de Hora Extra" },
  { id: 14, descricao: "Serviços Externos" },
  { id: 15, descricao: "Treinamento" },
  { id: 16, descricao: "Atraso" },
  { id: 17, descricao: "Saída Antecipada" },
  { id: 18, descricao: "Licença não Remunerada" },
];

export const MOTIVOS_DESC = MOTIVOS.map((m) => m.descricao);
