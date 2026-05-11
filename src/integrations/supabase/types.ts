export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agendamentos: {
        Row: {
          colaborador_id: string
          created_at: string
          data: string
          hora: string
          id: string
          observacao: string | null
          prioridade: Database["public"]["Enums"]["prioridade"]
          status: Database["public"]["Enums"]["agendamento_status"]
          tipo: Database["public"]["Enums"]["agendamento_tipo"]
          titulo: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data: string
          hora: string
          id?: string
          observacao?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          status?: Database["public"]["Enums"]["agendamento_status"]
          tipo: Database["public"]["Enums"]["agendamento_tipo"]
          titulo: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data?: string
          hora?: string
          id?: string
          observacao?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          status?: Database["public"]["Enums"]["agendamento_status"]
          tipo?: Database["public"]["Enums"]["agendamento_tipo"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "agendamentos_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      colaboradores: {
        Row: {
          area: string
          cargo: string
          created_at: string
          email: string
          gestor_id: string | null
          gpid: string
          id: string
          nome: string
          status: Database["public"]["Enums"]["colab_status"]
          turno: Database["public"]["Enums"]["turno_enum"]
          updated_at: string
        }
        Insert: {
          area: string
          cargo: string
          created_at?: string
          email: string
          gestor_id?: string | null
          gpid: string
          id?: string
          nome: string
          status?: Database["public"]["Enums"]["colab_status"]
          turno?: Database["public"]["Enums"]["turno_enum"]
          updated_at?: string
        }
        Update: {
          area?: string
          cargo?: string
          created_at?: string
          email?: string
          gestor_id?: string | null
          gpid?: string
          id?: string
          nome?: string
          status?: Database["public"]["Enums"]["colab_status"]
          turno?: Database["public"]["Enums"]["turno_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "colaboradores_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "gestores"
            referencedColumns: ["id"]
          },
        ]
      }
      faltas: {
        Row: {
          colaborador_id: string
          created_at: string
          data: string
          id: string
          motivo: string
          observacao: string | null
          periodo: Database["public"]["Enums"]["falta_periodo"]
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          data: string
          id?: string
          motivo: string
          observacao?: string | null
          periodo?: Database["public"]["Enums"]["falta_periodo"]
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          data?: string
          id?: string
          motivo?: string
          observacao?: string | null
          periodo?: Database["public"]["Enums"]["falta_periodo"]
        }
        Relationships: [
          {
            foreignKeyName: "faltas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      ferias: {
        Row: {
          colaborador_id: string
          created_at: string
          decidido_em: string | null
          decidido_por: string | null
          fim: string
          gestor_id: string | null
          id: string
          inicio: string
          motivo_recusa: string | null
          periodo_aquisitivo: string
          status: Database["public"]["Enums"]["ferias_status"]
          token_aprovacao: string
          updated_at: string
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          fim: string
          gestor_id?: string | null
          id?: string
          inicio: string
          motivo_recusa?: string | null
          periodo_aquisitivo: string
          status?: Database["public"]["Enums"]["ferias_status"]
          token_aprovacao?: string
          updated_at?: string
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          decidido_em?: string | null
          decidido_por?: string | null
          fim?: string
          gestor_id?: string | null
          id?: string
          inicio?: string
          motivo_recusa?: string | null
          periodo_aquisitivo?: string
          status?: Database["public"]["Enums"]["ferias_status"]
          token_aprovacao?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ferias_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ferias_gestor_id_fkey"
            columns: ["gestor_id"]
            isOneToOne: false
            referencedRelation: "gestores"
            referencedColumns: ["id"]
          },
        ]
      }
      gestores: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          teams_user_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          nome: string
          teams_user_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          teams_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      licencas: {
        Row: {
          colaborador_id: string
          created_at: string
          fim: string
          id: string
          inicio: string
          observacoes: string | null
          status: Database["public"]["Enums"]["licenca_status"]
          tipo: Database["public"]["Enums"]["licenca_tipo"]
        }
        Insert: {
          colaborador_id: string
          created_at?: string
          fim: string
          id?: string
          inicio: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["licenca_status"]
          tipo: Database["public"]["Enums"]["licenca_tipo"]
        }
        Update: {
          colaborador_id?: string
          created_at?: string
          fim?: string
          id?: string
          inicio?: string
          observacoes?: string | null
          status?: Database["public"]["Enums"]["licenca_status"]
          tipo?: Database["public"]["Enums"]["licenca_tipo"]
        }
        Relationships: [
          {
            foreignKeyName: "licencas_colaborador_id_fkey"
            columns: ["colaborador_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
      tarefas: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          prazo: string | null
          prioridade: Database["public"]["Enums"]["prioridade"]
          responsavel_id: string | null
          status: Database["public"]["Enums"]["tarefa_status"]
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["tarefa_status"]
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          prazo?: string | null
          prioridade?: Database["public"]["Enums"]["prioridade"]
          responsavel_id?: string | null
          status?: Database["public"]["Enums"]["tarefa_status"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "colaboradores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      agendamento_status: "Agendado" | "Realizado" | "Cancelado"
      agendamento_tipo: "De bem com a vida" | "Aniversário" | "Hora Extra"
      colab_status: "Ativo" | "Inativo" | "Afastado"
      falta_motivo:
        | "Atestado médico"
        | "Falta injustificada"
        | "Falta justificada"
        | "Atraso"
      falta_periodo: "Integral" | "Manhã" | "Tarde" | "Noite"
      ferias_status:
        | "Pendente"
        | "Aprovada"
        | "Recusada"
        | "Em gozo"
        | "Concluída"
      licenca_status: "Ativa" | "Encerrada" | "Pendente"
      licenca_tipo:
        | "Maternidade"
        | "Paternidade"
        | "Saúde"
        | "Sem vencimentos"
        | "Estudo"
      prioridade: "Baixa" | "Média" | "Alta"
      tarefa_status: "A fazer" | "Em andamento" | "Concluída"
      turno_enum: "Manhã" | "Tarde" | "Noite"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      agendamento_status: ["Agendado", "Realizado", "Cancelado"],
      agendamento_tipo: ["De bem com a vida", "Aniversário", "Hora Extra"],
      colab_status: ["Ativo", "Inativo", "Afastado"],
      falta_motivo: [
        "Atestado médico",
        "Falta injustificada",
        "Falta justificada",
        "Atraso",
      ],
      falta_periodo: ["Integral", "Manhã", "Tarde", "Noite"],
      ferias_status: [
        "Pendente",
        "Aprovada",
        "Recusada",
        "Em gozo",
        "Concluída",
      ],
      licenca_status: ["Ativa", "Encerrada", "Pendente"],
      licenca_tipo: [
        "Maternidade",
        "Paternidade",
        "Saúde",
        "Sem vencimentos",
        "Estudo",
      ],
      prioridade: ["Baixa", "Média", "Alta"],
      tarefa_status: ["A fazer", "Em andamento", "Concluída"],
      turno_enum: ["Manhã", "Tarde", "Noite"],
    },
  },
} as const
