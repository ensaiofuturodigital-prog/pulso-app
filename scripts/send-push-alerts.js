import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

webpush.setVapidDetails(
  'mailto:contato@pulso-app.local',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Janela de aviso: eventos agendados pra daqui a 10-20 minutos (o robô roda a cada 10 min).
const WINDOW_MIN_MINUTES = 8;
const WINDOW_MAX_MINUTES = 20;

function nowInBRT() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

async function run() {
  const now = nowInBRT();
  const from = new Date(now.getTime() + WINDOW_MIN_MINUTES * 60000);
  const to = new Date(now.getTime() + WINDOW_MAX_MINUTES * 60000);
  const today = now.toISOString().slice(0, 10);

  // Eventos de hoje que ainda nao foram avisados
  const { data: schedule, error } = await supabase
    .from('release_schedule')
    .select('*, indicators(name_pt, importance, typical_time_brt)')
    .eq('release_date', today)
    .eq('notified', false);
  if (error) throw error;

  if (!schedule || schedule.length === 0) {
    console.log('Nenhum evento pendente de aviso hoje.');
    return;
  }

  // Filtra só os que tem horário típico cadastrado no indicador e caem dentro da janela de aviso.
  // Não temos a hora exata do evento (o calendário do FRED só dá a data), então usamos o horário
  // típico de divulgação daquele indicador como aproximação.
  const dueEvents = schedule.filter((s) => {
    const timeStr = s.indicators?.typical_time_brt;
    if (!timeStr) return false;
    const [h, m] = timeStr.split(':').map(Number);
    const eventTime = new Date(now);
    eventTime.setHours(h, m, 0, 0);
    return eventTime >= from && eventTime <= to;
  });

  if (dueEvents.length === 0) {
    console.log('Nenhum evento cai na janela de aviso agora.');
    return;
  }

  const { data: subs } = await supabase.from('push_subscriptions').select('*');
  if (!subs || subs.length === 0) {
    console.log('Sem inscritos pra notificar (ninguem ativou ainda). Marcando como avisado mesmo assim.');
  }

  for (const ev of dueEvents) {
    const name = ev.indicators?.name_pt || 'Indicador econômico';
    const timeStr = ev.indicators?.typical_time_brt;
    const payload = JSON.stringify({
      title: `⏰ ${name} sai em breve`,
      body: `Divulgação prevista por volta das ${timeStr} (Brasília). Fique de olho no WDO/WIN.`,
      url: '/',
    });

    for (const sub of subs || []) {
      const subscription = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      };
      try {
        await webpush.sendNotification(subscription, payload);
      } catch (err) {
        console.error(`Falha ao notificar ${sub.endpoint.slice(0, 40)}...:`, err.statusCode || err.message);
        if (err.statusCode === 404 || err.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          console.log('Inscrição expirada removida.');
        }
      }
    }

    await supabase
      .from('release_schedule')
      .update({ notified: true })
      .eq('indicator_id', ev.indicator_id)
      .eq('release_date', ev.release_date);

    console.log(`✅ Avisado: ${name} (${ev.release_time})`);
  }
}

run().catch((err) => { console.error('Erro geral:', err); process.exit(1); });
