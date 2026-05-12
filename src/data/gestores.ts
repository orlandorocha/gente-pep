// Lista de gestores oficiais. A relação real (id) é carregada da tabela `gestores`
// no banco — esta lista serve de referência para validação e seed.
export const GESTORES = ["ANDREW", "RODRIGO THOMAS","EDIMAR", "ROSIMEIRE SILVA", "MARCOS SILVA"] as const;

export type GestorNome = (typeof GESTORES)[number];
