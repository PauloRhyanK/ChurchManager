
# Painel Administrativo da Igreja

## Visão Geral
Interface administrativa moderna e minimalista para gestão de uma igreja, com design clean, modular e responsivo.

## Design System
- **Fundo:** slate-50 com cards brancos
- **Cor primária:** Violet/Slate Blue — transmitindo serenidade e seriedade
- **Tipografia:** Inter, com pesos bem definidos
- **Cards:** rounded-xl, shadow-sm, muito whitespace
- **Ícones:** Lucide React

## Layout Base
- **Sidebar fixa** com logo da igreja no topo, navegação com ícones, foto do usuário e configurações na parte inferior. Colapsável em mobile (hambúrguer no header).
- **Header** com busca global, breadcrumb dinâmico e ícone de notificações.
- **Área principal** espaçosa com slot para módulos.

## Páginas e Módulos

### 1. Visão Geral (Dashboard)
- Cards de resumo: Total em Caixa, Membros Ativos, Eventos do Mês, Visitantes Recentes
- Mini gráfico de tendência no card financeiro
- Lista de próximos eventos
- Atividade recente

### 2. Financeiro
- Tabela de entradas/saídas com filtros
- Gráfico de barras do fluxo de caixa mensal
- Botões "Nova Receita" e "Nova Despesa"
- Cards de resumo (receitas, despesas, saldo)

### 3. Eventos
- Lista de cards com próximos cultos, retiros, encontros
- Botão "Criar Evento"
- Filtro por tipo de evento

### 4. Site (CMS)
- Gestão de banners, avisos e vídeos
- Cards editáveis com preview

### 5. Gestão (Em breve)
- Itens no menu: Escalas e Células/Grupos
- Badge "Em breve" + ícone de cadeado
- Desabilitados visualmente

### 6. Configurações
- Layout com abas horizontais: Perfil do Usuário, Permissões de Acesso, Gerenciamento do Painel
- Toggle para ativar/desativar módulos

## Responsividade
- Mobile-first: sidebar vira drawer com trigger no header
- Cards empilham em coluna no mobile
- Tabelas com scroll horizontal em telas pequenas

## Estrutura de Componentes
- `AppSidebar` — navegação lateral
- `AppHeader` — busca, breadcrumb, notificações
- `DashboardLayout` — shell com sidebar + header + slot de conteúdo
- Páginas: `Dashboard`, `Financial`, `Events`, `SiteManagement`, `Settings`
- Componentes reutilizáveis: `StatCard`, `RecentActivity`, `DataTable`
