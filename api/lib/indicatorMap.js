// Mapeia o nome do evento como aparece no Trading Economics pro código de
// indicador que o Pulso já tem cadastrado em `indicators`. Atualizar esta
// lista conforme forem aparecendo nomes novos nos calendários que você colar.
export const EVENT_TO_CODE = {
  'Non Farm Payrolls': 'PAYEMS',
  'Retail Sales MoM': 'RSAFS',
  'Core Inflation Rate YoY': 'CPILFESL',
  'Inflation Rate YoY': 'CPIAUCSL',
  'Core Inflation Rate MoM': 'CPILFESL',
  'Inflation Rate MoM': 'CPIAUCSL',
  'Balance of Trade': 'BOPGSTB',
  'PPI MoM': 'PPIACO',
  'Building Permits': 'PERMIT',
  'Housing Starts': 'HOUST',
  'Michigan Consumer Sentiment': 'UMCSENT',
  'Unemployment Rate': 'UNRATE', // só quando country === 'US'; BR usa BCB_DESEMPREGO (ver abaixo)
  'Core PCE Price Index MoM': 'PCEPILFE',
  'Fed Interest Rate Decision': 'DFF',
  'ECB Interest Rate Decision': 'ECBMRRFR',
  'Deposit Facility Rate': 'ECBDFR',
  'Durable Goods Orders MoM': 'DGORDER',
  'Personal Income MoM': 'PI',
  'Personal Spending MoM': 'PCE',
  'JOLTs Job Openings': 'JTSJOL',
  'Initial Jobless Claims': 'ICSA',
  'MBA 30-Year Mortgage Rate': 'MORTGAGE30US',
  'EIA Crude Oil Stocks Change': 'WCESTUS1',
  'Fed Balance Sheet': 'WALCL',
  'Interest Rate Decision': 'BCB_SELIC', // só quando country === 'BR'
};

// Mesma coisa, só que pros nomes em português como aparecem no calendário do
// Investing.com (adicionado em 21/08/2026 quando o Pulso passou a ler de lá
// também). Construído e testado contra um calendário real colado por você —
// só entraram aqui os nomes que EU JÁ CONFIRMEI que aparecem exatamente assim.
// Todo indicador que ainda não apareceu numa semana de teste real fica de
// fora por enquanto (aparece em "sem_mapa" no resultado do processamento) —
// vá me mandando o print de "sem_mapa" que eu vou completando essa lista aos
// poucos, do jeito mais seguro (nunca advinhando o nome exato).
export const EVENT_TO_CODE_PT = {
  'Licenças de Construção': 'PERMIT',
  'Construção de Novas Casas': 'HOUST',
  'Estoques de Petróleo Bruto': 'WCESTUS1', // sem "Semanal API" no nome — esse é outro relatório (não oficial), não mapeado de propósito
  'Juros de Hipotecas de 30 anos MBA': 'MORTGAGE30US',
  'Pedidos Iniciais por Seguro-Desemprego': 'ICSA',
  'Balanço Patrimonial do Federal Reserve': 'WALCL',
  'Saldos de reservas com bancos do Federal Reserve': 'WRESBAL',
  'IPC Zona do Euro (Anual)': 'CP0000EZ19M086NEST',
  // Confirmados em 26/08/2026 contra um calendário real de agosto inteiro:
  'Gastos Pessoais (Mensal)': 'PCE',
  'Núcleo de Preços PCE': 'PCEPILFE', // "Núcleo" = core; a versão "Índice de Preços PCE (Mensal)" sem núcleo NÃO é mapeada (não tem código dela ainda)
  'Pedidos de Bens Duravéis (Mensal)': 'DGORDER', // sic — assim mesmo, sem acento no "a", é como o Investing.com escreve
  'Pedidos de Bens Duráveis (Mensal)': 'DGORDER', // grafia correta, caso apareça assim em algum outro texto
};

// Casos especiais que dependem do país (mesmo nome de evento, indicador diferente)
export function resolveCode(eventName, country) {
  if (eventName === 'Unemployment Rate' && country === 'BR') return 'BCB_DESEMPREGO';
  if (eventName === 'Interest Rate Decision' && country === 'BR') return 'BCB_SELIC';
  if (eventName.startsWith('GDP Growth Rate')) {
    if (country === 'US') return 'GDPC1';
    return null; // PIB da Zona do Euro ainda não é rastreado pelo Pulso
  }
  // "Balança Comercial" sozinho (sem "de Bens") só é o Balance of Trade
  // oficial dos EUA quando country === 'US' — a mesma frase aparece pra
  // Zona do Euro com outro significado, que o Pulso ainda não rastreia.
  if (eventName === 'Balança Comercial' && country === 'US') return 'BOPGSTB';
  // "IPC-núcleo (Anual)" é Core CPI dos EUA só quando country === 'US' —
  // a mesma frase aparece pra Zona do Euro com um indicador que o Pulso
  // ainda não rastreia separadamente.
  if (eventName === 'IPC-núcleo (Anual)' && country === 'US') return 'CPILFESL';
  return EVENT_TO_CODE[eventName] || EVENT_TO_CODE_PT[eventName] || null;
}
