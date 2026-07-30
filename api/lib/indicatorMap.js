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

// Casos especiais que dependem do país (mesmo nome de evento, indicador diferente)
export function resolveCode(eventName, country) {
  if (eventName === 'Unemployment Rate' && country === 'BR') return 'BCB_DESEMPREGO';
  if (eventName === 'Interest Rate Decision' && country === 'BR') return 'BCB_SELIC';
  if (eventName.startsWith('GDP Growth Rate')) {
    if (country === 'US') return 'GDPC1';
    return null; // PIB da Zona do Euro ainda não é rastreado pelo Pulso
  }
  return EVENT_TO_CODE[eventName] || null;
}
