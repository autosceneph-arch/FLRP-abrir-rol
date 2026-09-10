const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});

// ====================== RUTAS DE DATOS ======================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const STATE_FILE = path.join(DATA_DIR, 'state.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

// ====================== CARGA / GUARDADO ======================
function loadJSON(file, defaultValue) {
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {}
  return defaultValue;
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let state = loadJSON(STATE_FILE, {
  status: 'closed',
  messageId: null,
  channelId: null,
  startedBy: null,
  startTime: null,
  pausedAt: null,
  totalPausedMs: 0,
  allowedRoles: [],
  permanentMessageRole: null,
  mentionRole: null,
  vias: null,
  limite: null,
  evento: 'Sin eventos',
  codigo: 'No definido',
  adelantamiento: null,
  carteles: 'inactivos'
});

let stats = loadJSON(STATS_FILE, {});
const activeVotes = new Map();

function saveState() { saveJSON(STATE_FILE, state); }
function saveStats() { saveJSON(STATS_FILE, stats); }

// ====================== UTILIDADES ======================
function getUserStats(userId) {
  if (!stats[userId]) {
    stats[userId] = {
      totalHours: 0,
      rpsOpened: 0,
      rpsFinished: 0,
      sessions: [],
      activeDays: new Set(),
      weekly: {},
      monthly: {}
    };
  }
  if (Array.isArray(stats[userId].activeDays)) {
    stats[userId].activeDays = new Set(stats[userId].activeDays);
  } else if (!(stats[userId].activeDays instanceof Set)) {
    stats[userId].activeDays = new Set();
  }
  return stats[userId];
}

function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

function getWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function hasGeneralPermission(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (state.allowedRoles.length === 0) return true;
  return member.roles.cache.some(r => state.allowedRoles.includes(r.id));
}

function canUsePermanentMessage(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (!state.permanentMessageRole) return false;
  return member.roles.cache.has(state.permanentMessageRole);
}

function makeDays(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push(`seed-day-${i + 1}`);
  }
  return arr;
}

async function safeDelete(message, retries = 5) {
  for (let i = 0; i < retries; i++) {
    try {
      if (!message || !message.deletable) return;
      await message.delete();
      return;
    } catch (e) {
      if (e.code === 10008) return;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

function scheduleDelete(message, delayMs) {
  setTimeout(() => {
    safeDelete(message).catch(() => {});
  }, delayMs);
}

async function sendActionDm(userId, text) {
  try {
    const user = await client.users.fetch(userId);
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xFF69B4)
          .setTitle('📝 Registro de acción · Florida States RP')
          .setDescription(text)
          .setTimestamp()
          .setFooter({ text: 'Guarda este mensaje como comprobante' })
      ]
    });
  } catch (e) {}
}

// ====================== SEED ESTADÍSTICAS ======================
function seedInitialStats() {
  const weekKey = getWeekKey();
  const monthKey = getMonthKey();

  const SEED = {
    '1248999794417078349': {
      totalHours: 98040000, rpsOpened: 13, rpsFinished: 13,
      sessions: [], activeDays: makeDays(1),
      weekly: { [weekKey]: 20820000 }, monthly: { [monthKey]: 61200000 }
    },
    '393840505768902656': {
      totalHours: 64380000, rpsOpened: 11, rpsFinished: 11,
      sessions: [], activeDays: makeDays(2),
      weekly: { [weekKey]: 3540000 }, monthly: { [monthKey]: 44820000 }
    },
    '1460163729554538506': {
      totalHours: 54960000, rpsOpened: 11, rpsFinished: 11,
      sessions: [], activeDays: makeDays(4),
      weekly: { [weekKey]: 6900000 }, monthly: { [monthKey]: 45660000 }
    },
    '1229532731579564186': {
      totalHours: 38760000, rpsOpened: 5, rpsFinished: 4,
      sessions: [], activeDays: makeDays(2),
      weekly: {}, monthly: { [monthKey]: 36000000 }
    },
    '1243935410749440043': {
      totalHours: 35040000, rpsOpened: 8, rpsFinished: 8,
      sessions: [], activeDays: makeDays(1),
      weekly: {}, monthly: { [monthKey]: 33600000 }
    },
    '1375497158987616458': {
      totalHours: 27720000, rpsOpened: 5, rpsFinished: 4,
      sessions: [], activeDays: makeDays(3),
      weekly: { [weekKey]: 9480000 }, monthly: { [monthKey]: 18240000 }
    },
    '926167544618946670': {
      totalHours: 22080000, rpsOpened: 3, rpsFinished: 3,
      sessions: [], activeDays: makeDays(1),
      weekly: { [weekKey]: 5940000 }, monthly: { [monthKey]: 16140000 }
    },
    '1381812641806422118': {
      totalHours: 21780000, rpsOpened: 4, rpsFinished: 4,
      sessions: [], activeDays: makeDays(2),
      weekly: { [weekKey]: 960000 }, monthly: { [monthKey]: 15360000 }
    },
    '898670938927820821': {
      totalHours: 14880000, rpsOpened: 1, rpsFinished: 1,
      sessions: [], activeDays: makeDays(0),
      weekly: {}, monthly: { [monthKey]: 14880000 }
    },
    '1514783048179253367': {
      totalHours: 14820000, rpsOpened: 3, rpsFinished: 4,
      sessions: [], activeDays: makeDays(1),
      weekly: { [weekKey]: 8820000 }, monthly: { [monthKey]: 14820000 }
    },
    '1105619708792815693': {
      totalHours: 13440000, rpsOpened: 4, rpsFinished: 4,
      sessions: [], activeDays: makeDays(0),
      weekly: { [weekKey]: 5640000 }, monthly: { [monthKey]: 13440000 }
    },
    '889615324973002803': {
      totalHours: 12600000, rpsOpened: 5, rpsFinished: 4,
      sessions: [], activeDays: makeDays(1),
      weekly: {}, monthly: { [monthKey]: 7740000 }
    },
    '1206052156629852202': {
      totalHours: 5940000, rpsOpened: 1, rpsFinished: 1,
      sessions: [], activeDays: makeDays(0),
      weekly: { [weekKey]: 5940000 }, monthly: { [monthKey]: 5940000 }
    },
    '1030565377253584968': {
      totalHours: 3000000, rpsOpened: 1, rpsFinished: 1,
      sessions: [], activeDays: makeDays(0),
      weekly: { [weekKey]: 3000000 }, monthly: { [monthKey]: 3000000 }
    }
  };

  let changed = false;
  for (const [userId, data] of Object.entries(SEED)) {
    if (!stats[userId]) {
      stats[userId] = { ...data };
      changed = true;
    } else {
      const s = stats[userId];
      if ((s.totalHours || 0) < data.totalHours) { s.totalHours = data.totalHours; changed = true; }
      if ((s.rpsOpened || 0) < data.rpsOpened) { s.rpsOpened = data.rpsOpened; changed = true; }
      if ((s.rpsFinished || 0) < data.rpsFinished) { s.rpsFinished = data.rpsFinished; changed = true; }

      const currentDays = Array.isArray(s.activeDays) ? s.activeDays.length : (s.activeDays?.size || 0);
      if (currentDays < data.activeDays.length) { s.activeDays = data.activeDays; changed = true; }

      if (!s.weekly) s.weekly = {};
      if (!s.monthly) s.monthly = {};
      for (const [k, v] of Object.entries(data.weekly || {})) {
        if ((s.weekly[k] || 0) < v) { s.weekly[k] = v; changed = true; }
      }
      for (const [k, v] of Object.entries(data.monthly || {})) {
        if ((s.monthly[k] || 0) < v) { s.monthly[k] = v; changed = true; }
      }
    }
  }

  if (changed) {
    saveStats();
    console.log('✅ Estadísticas v2.1.0 cargadas / fusionadas');
  }
}

// ====================== EMBEDS ======================
const PINK = 0xFF69B4;

function createStatusEmbed() {
  let statusText = '';
  let color = PINK;

  if (state.status === 'active') {
    statusText = '🟢 **ROL ACTIVO**';
    color = 0x00FF7F;
  } else if (state.status === 'frp') {
    statusText = '⏸️ **FRP-FARMING ACTIVO**';
    color = 0xFFA500;
  } else {
    statusText = '🔴 **ROL CERRADO**';
    color = 0xFF0000;
  }

  let viasDisplay = state.status === 'frp' ? '-' : (state.vias !== null ? state.vias : 'No definido');
  let limiteDisplay = state.status === 'frp' ? '-' : (state.limite !== null ? state.limite : 'No definido');

  let adelantamientoDisplay = 'No definido';
  if (state.adelantamiento === 0) adelantamientoDisplay = 'no';
  else if (state.adelantamiento !== null) adelantamientoDisplay = state.adelantamiento;

  let hostDisplay = '-';
  if (state.status === 'active' && state.startedBy) {
    hostDisplay = `<@${state.startedBy}>`;
  }

  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🌸 Estado del Rol ・ Florida States RP')
    .setDescription(`\`\`\`\n${statusText}\n\`\`\``)
    .addFields(
      { name: '🛣️ Vías', value: `\`${viasDisplay}\``, inline: true },
      { name: '🏎️ Límite de Velocidad', value: `\`${limiteDisplay}\``, inline: true },
      { name: '🔑 Código', value: `\`${state.codigo || 'No definido'}\``, inline: true },
      { name: '⚡ Adelantamiento', value: `\`${adelantamientoDisplay}\``, inline: true },
      { name: '🏴 Carteles', value: `\`${state.carteles || 'inactivos'}\``, inline: true },
      { name: '🎉 Evento', value: `\`${state.evento || 'Sin eventos'}\``, inline: true },
      { name: '👑 Host', value: hostDisplay, inline: true },
      { name: '📅 Última actualización', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
    )
    .setFooter({ text: 'Florida States RP • v2.1.0' })
    .setTimestamp();
}

function createButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('activar_rol').setLabel('Activar Rol').setStyle(ButtonStyle.Success).setEmoji('🟢'),
    new ButtonBuilder().setCustomId('cerrar_rol').setLabel('Cerrar Rol').setStyle(ButtonStyle.Danger).setEmoji('🏁'),
    new ButtonBuilder().setCustomId('activar_frp').setLabel('Activar FRP-Farming').setStyle(ButtonStyle.Primary).setEmoji('⏸️'),
    new ButtonBuilder().setCustomId('desactivar_frp').setLabel('Desactivar FRP-Farming').setStyle(ButtonStyle.Secondary).setEmoji('▶️')
  );
}

// ====================== MENSAJES AUTOMÁTICOS ======================
function getAperturaMsg(userId) {
  const mention = state.mentionRole ? `<@&${state.mentionRole}>` : '';
  return `# 🚨・APERTURA DE ROL
${mention}
> **Abierto por:** <@${userId}>
> Al iniciar el rol, **todos deberán tener sus papeles y documentos en regla.** 📄
🚗・**Licencia**
🪪・**Identificación**
📋・**Documentación del vehículo**
📑・**Cualquier otro documento requerido**
> ⚠️ **Si no cuentan con los documentos correspondientes o incumplen las normas de rol, podrán ser KICKEADOS del servidor sin previo aviso.**
### 🔒・¡TODO EN REGLA ANTES DE COMENZAR! 🚨`;
}

function getCierreMsg(userId) {
  const mention = state.mentionRole ? `<@&${state.mentionRole}>` : '';
  return `# 🏁・CIERRE DE ROL
${mention}
> **Cerrado por:** <@${userId}>
> ❤️ Gracias a todos por participar en el rol de hoy.
⭐ **No olviden calificar a los administradores** que estuvieron apoyando durante el rol en <#1452871884071899217>.
🙏 Agradecemos muchísimo a todos los **moderadores y administradores** que estuvieron pendientes y apoyando el servidor durante el rol.
> 💙 ¡Gracias por ser parte de **Florida States RP**!`;
}

function getFrpMsg(userId) {
  return `# ⏸️・FRP-FARMING ACTIVADO
> **Activado por:** <@${userId}>
> 🚨 **SE PAUSÓ / APAGÓ EL ROL** para realizar actividades de **FRP-Farming**.
⚠️ **IMPORTANTE:** Esto **NO significa necesariamente que el rol se cerró**. El FRP-Farming puede activarse con el rol abierto, como es habitual.
📢 Se avisará cuando el rol vuelva a estar activo normalmente.`;
}

function getDesactivarFrpMsg(userId) {
  return `# ▶️・FRP-FARMING DESACTIVADO
> **Desactivado por:** <@${userId}>
> El rol vuelve a su estado anterior. El temporizador continúa si el rol estaba activo.`;
}

async function sendTempMessage(channel, content, delayMs = 15 * 60 * 1000) {
  const msg = await channel.send({ content });
  scheduleDelete(msg, delayMs);
  return msg;
}

// ====================== ACTUALIZAR MENSAJE PERMANENTE ======================
async function updatePermanentMessage(interaction = null) {
  if (!state.channelId || !state.messageId) return;

  try {
    const channel = await client.channels.fetch(state.channelId);
    const message = await channel.messages.fetch(state.messageId);
    await message.edit({
      embeds: [createStatusEmbed()],
      components: [createButtons()]
    });
  } catch (err) {
    console.log('No se pudo editar el mensaje permanente, creando uno nuevo...');
    if (interaction) {
      const channel = interaction.channel;
      const newMsg = await channel.send({
        embeds: [createStatusEmbed()],
        components: [createButtons()]
      });
      state.messageId = newMsg.id;
      state.channelId = channel.id;
      saveState();
    }
  }
}

// ====================== LÓGICA DE BOTONES ======================
async function handleButton(interaction) {
  if (!hasGeneralPermission(interaction.member)) {
    return interaction.reply({ content: '❌ No tienes permiso para usar estos botones.', ephemeral: true });
  }

  const userId = interaction.user.id;
  const userStats = getUserStats(userId);
  const now = Date.now();

  const confirm = async (text) => {
    await interaction.reply({ content: text, ephemeral: true });
  };

  switch (interaction.customId) {
    case 'activar_rol': {
      if (state.status === 'active') return confirm('⚠️ El rol ya está activo.');

      state.status = 'active';
      state.startedBy = userId;
      state.startTime = now;
      state.pausedAt = null;
      state.totalPausedMs = 0;

      userStats.rpsOpened++;
      userStats.activeDays.add(new Date().toISOString().slice(0, 10));

      saveState();
      saveStats();
      await updatePermanentMessage(interaction);
      await sendTempMessage(interaction.channel, getAperturaMsg(userId));
      await sendActionDm(userId, '🟢 **Abriste sesión (RP)**\nEl rol fue activado por ti.\nGuarda este mensaje como comprobante.');
      await confirm('🟢 **Rol activado** correctamente.');
      break;
    }

    case 'cerrar_rol': {
      if (state.status === 'closed') return confirm('⚠️ El rol ya está cerrado.');

      let duration = 0;
      if (state.startTime) {
        const totalElapsed = now - state.startTime;
        duration = totalElapsed - (state.totalPausedMs || 0);
        if (state.pausedAt) duration -= (now - state.pausedAt);
        if (duration < 0) duration = 0;
      }

      const openerId = state.startedBy || userId;
      const openerStats = getUserStats(openerId);

      openerStats.totalHours += duration;
      openerStats.rpsFinished++;
      openerStats.sessions.push({
        start: state.startTime,
        end: now,
        durationMs: duration,
        agregado: false
      });

      const weekKey = getWeekKey();
      const monthKey = getMonthKey();
      openerStats.weekly[weekKey] = (openerStats.weekly[weekKey] || 0) + duration;
      openerStats.monthly[monthKey] = (openerStats.monthly[monthKey] || 0) + duration;
      openerStats.activeDays = Array.from(openerStats.activeDays);

      state.status = 'closed';
      state.startedBy = null;
      state.startTime = null;
      state.pausedAt = null;
      state.totalPausedMs = 0;

      saveState();
      saveStats();
      await updatePermanentMessage(interaction);
      await sendTempMessage(interaction.channel, getCierreMsg(userId));
      await sendActionDm(userId, `🏁 **Cerraste sesión (RP)**\nDuración de esta sesión: **${formatDuration(duration)}**\nGuarda este mensaje como comprobante.`);
      if (openerId !== userId) {
        await sendActionDm(openerId, `🏁 **Tu sesión de RP fue cerrada** por <@${userId}>\nDuración registrada: **${formatDuration(duration)}**`);
      }
      await confirm(`🏁 **Rol cerrado**. Duración: **${formatDuration(duration)}**`);
      break;
    }

    case 'activar_frp': {
      if (state.status === 'frp') return confirm('⚠️ FRP-Farming ya está activo.');
      if (state.status === 'closed') {
        state.status = 'frp';
      } else {
        state.pausedAt = now;
        state.status = 'frp';
      }

      state.codigo = 'FLRP1';
      saveState();
      await updatePermanentMessage(interaction);
      await sendTempMessage(interaction.channel, getFrpMsg(userId));
      await sendActionDm(userId, '⏸️ **Activaste FRP-Farming**\nEl temporizador de RP se pausó (si había rol activo).\nCódigo del servidor: **FLRP1**');
      await confirm('⏸️ **FRP-Farming activado**. Código → **FLRP1**');
      break;
    }

    case 'desactivar_frp': {
      if (state.status !== 'frp') return confirm('⚠️ FRP-Farming no está activo.');

      if (state.pausedAt && state.startTime) {
        state.totalPausedMs += (now - state.pausedAt);
        state.pausedAt = null;
        state.status = 'active';
      } else {
        state.status = 'closed';
      }

      saveState();
      await updatePermanentMessage(interaction);
      await sendTempMessage(interaction.channel, getDesactivarFrpMsg(userId));
      await sendActionDm(userId, '▶️ **Desactivaste FRP-Farming**\nEl temporizador continúa si el rol estaba activo.');
      await confirm('▶️ **FRP-Farming desactivado**.');
      break;
    }
  }
}

// ====================== COMANDOS SLASH ======================
const commands = [
  new SlashCommandBuilder()
    .setName('mensaje-permanente')
    .setDescription('Coloca el mensaje permanente de estado del rol en este canal'),

  new SlashCommandBuilder()
    .setName('config-roles')
    .setDescription('Configura los roles de permisos del bot')
    .addRoleOption(opt => opt.setName('rol').setDescription('Rol general (botones + comandos)').setRequired(true))
    .addRoleOption(opt => opt.setName('rol-permanente').setDescription('Rol único para /mensaje-permanente y agregar stats').setRequired(false))
    .addRoleOption(opt => opt.setName('rol-mencion').setDescription('Rol mencionado en apertura/cierre').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('vias')
    .setDescription('Configura el número de vías (1 o 2)')
    .addIntegerOption(opt => opt.setName('valor').setDescription('1 o 2').setRequired(true).setMinValue(1).setMaxValue(2)),

  new SlashCommandBuilder()
    .setName('limite')
    .setDescription('Configura el límite de velocidad')
    .addIntegerOption(opt => opt.setName('valor').setDescription('Límite').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('codigo')
    .setDescription('Configura el código del servidor')
    .addStringOption(opt => opt.setName('codigo').setDescription('Código').setRequired(true)),

  new SlashCommandBuilder()
    .setName('adelantamiento')
    .setDescription('Configura el adelantamiento (0 = no, o 80-200)')
    .addIntegerOption(opt => opt.setName('valor').setDescription('0 o 80-200').setRequired(true).setMinValue(0).setMaxValue(200)),

  new SlashCommandBuilder()
    .setName('carteles')
    .setDescription('Configura el estado de los carteles')
    .addStringOption(opt =>
      opt.setName('estado').setDescription('Estado').setRequired(true)
        .addChoices({ name: 'Activos', value: 'activos' }, { name: 'Inactivos', value: 'inactivos' })
    ),

  new SlashCommandBuilder()
    .setName('evento')
    .setDescription('Activa un evento')
    .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del evento').setRequired(true)),

  new SlashCommandBuilder()
    .setName('terminar-evento')
    .setDescription('Termina el evento actual'),

  new SlashCommandBuilder()
    .setName('votacion')
    .setDescription('Inicia una votación para abrir rol')
    .addIntegerOption(opt => opt.setName('numero').setDescription('Votos requeridos').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('agregar-dias')
    .setDescription('Agrega días activos a un usuario (solo rol permanente)')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
    .addIntegerOption(opt => opt.setName('cantidad').setDescription('Cantidad').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('agregar-tiempo')
    .setDescription('Agrega tiempo en minutos (solo rol permanente)')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
    .addIntegerOption(opt => opt.setName('minutos').setDescription('Minutos').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('agregar-rps-abiertos')
    .setDescription('Agrega RPs abiertos (solo rol permanente)')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
    .addIntegerOption(opt => opt.setName('cantidad').setDescription('Cantidad').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('agregar-rps-cerrados')
    .setDescription('Agrega RPs finalizados (solo rol permanente)')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(true))
    .addIntegerOption(opt => opt.setName('cantidad').setDescription('Cantidad').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('rp-stats')
    .setDescription('Ver estadísticas de un usuario')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(false)),

  new SlashCommandBuilder()
    .setName('horas-totales')
    .setDescription('Leaderboard de horas totales')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rps-abiertos')
    .setDescription('Leaderboard de RPs abiertos')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rps-finalizados')
    .setDescription('Leaderboard de RPs finalizados')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(false)),

  new SlashCommandBuilder()
    .setName('dias-activos')
    .setDescription('Leaderboard de días activos')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(false)),

  new SlashCommandBuilder()
    .setName('actividad-semanal')
    .setDescription('Leaderboard semanal')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(false)),

  new SlashCommandBuilder()
    .setName('actividad-mensual')
    .setDescription('Leaderboard mensual')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(false)),

  new SlashCommandBuilder()
    .setName('duracion-sesiones')
    .setDescription('Últimas sesiones de un usuario')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(false))
].map(c => c.toJSON());

// ====================== READY ======================
client.once('ready', async () => {
  console.log(`🌸 Bot listo como ${client.user.tag} | v2.1.0`);
  seedInitialStats();

  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Comandos slash registrados');
  } catch (e) {
    console.error(e);
  }

  if (state.channelId && state.messageId) {
    await updatePermanentMessage();
  }
});

// ====================== AUTO-BORRADO ======================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!state.channelId || message.channel.id !== state.channelId) return;
  if (message.id === state.messageId) return;
  if (activeVotes.has(message.id)) return;

  scheduleDelete(message, 20 * 60 * 1000);
});

// ====================== REACCIONES VOTACIÓN ======================
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) {
    try { await reaction.fetch(); } catch { return; }
  }

  const message = reaction.message;
  if (!activeVotes.has(message.id)) return;

  const voteData = activeVotes.get(message.id);
  if (voteData.reached) return;
  if (reaction.emoji.name !== '✅') return;

  if (reaction.count >= voteData.required) {
    voteData.reached = true;
    activeVotes.set(message.id, voteData);
    const iniciador = voteData.startedBy ? `<@${voteData.startedBy}>` : 'el host';
    const alertMsg = await message.channel.send({
      content: `✅ **¡Votación alcanzada!** ${iniciador} abrirá pronto el rol.`
    });
    scheduleDelete(alertMsg, 20 * 60 * 1000);
  }
});

// ====================== INTERACCIONES ======================
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) return handleButton(interaction);
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'mensaje-permanente') {
    if (!canUsePermanentMessage(interaction.member)) {
      return interaction.reply({ content: '❌ Solo el rol-permanente o Admins.', ephemeral: true });
    }
    const msg = await interaction.channel.send({
      embeds: [createStatusEmbed()],
      components: [createButtons()]
    });
    state.messageId = msg.id;
    state.channelId = interaction.channel.id;
    saveState();
    await interaction.reply({ content: '✅ Mensaje permanente colocado.', ephemeral: true });
  }

  else if (commandName === 'config-roles') {
    const role = interaction.options.getRole('rol');
    const permanentRole = interaction.options.getRole('rol-permanente');
    const mentionRole = interaction.options.getRole('rol-mencion');
    let response = '';

    const idx = state.allowedRoles.indexOf(role.id);
    if (idx === -1) {
      state.allowedRoles.push(role.id);
      response += `✅ Rol general **${role.name}** añadido.\n`;
    } else {
      state.allowedRoles.splice(idx, 1);
      response += `🗑️ Rol general **${role.name}** eliminado.\n`;
    }
    if (permanentRole) {
      state.permanentMessageRole = permanentRole.id;
      response += `🔒 Rol permanente (mensaje + stats): **${permanentRole.name}**\n`;
    }
    if (mentionRole) {
      state.mentionRole = mentionRole.id;
      response += `📢 Rol mención: **${mentionRole.name}**`;
    }
    saveState();
    await interaction.reply({ content: response || 'Sin cambios.', ephemeral: true });
  }

  else if (commandName === 'vias') {
    if (!hasGeneralPermission(interaction.member)) return interaction.reply({ content: '❌ Sin permiso.', ephemeral: true });
    state.vias = interaction.options.getInteger('valor');
    saveState();
    await updatePermanentMessage(interaction);
    await interaction.reply({ content: `✅ Vías: **${state.vias}**`, ephemeral: true });
  }

  else if (commandName === 'limite') {
    if (!hasGeneralPermission(interaction.member)) return interaction.reply({ content: '❌ Sin permiso.', ephemeral: true });
    state.limite = interaction.options.getInteger('valor');
    saveState();
    await updatePermanentMessage(interaction);
    await interaction.reply({ content: `✅ Límite: **${state.limite}**`, ephemeral: true });
  }

  else if (commandName === 'codigo') {
    if (!hasGeneralPermission(interaction.member)) return interaction.reply({ content: '❌ Sin permiso.', ephemeral: true });
    state.codigo = interaction.options.getString('codigo');
    saveState();
    await updatePermanentMessage(interaction);
    await interaction.reply({ content: `🔑 Código: **${state.codigo}**`, ephemeral: true });
  }

  else if (commandName === 'adelantamiento') {
    if (!hasGeneralPermission(interaction.member)) return interaction.reply({ content: '❌ Sin permiso.', ephemeral: true });
    const valor = interaction.options.getInteger('valor');
    if (valor !== 0 && (valor < 80 || valor > 200)) {
      return interaction.reply({ content: '❌ Usa **0** o un número entre **80 y 200**.', ephemeral: true });
    }
    state.adelantamiento = valor;
    saveState();
    await updatePermanentMessage(interaction);
    await interaction.reply({ content: `⚡ Adelantamiento: **${valor === 0 ? 'no' : valor}**`, ephemeral: true });
  }

  else if (commandName === 'carteles') {
    if (!hasGeneralPermission(interaction.member)) return interaction.reply({ content: '❌ Sin permiso.', ephemeral: true });
    state.carteles = interaction.options.getString('estado');
    saveState();
    await updatePermanentMessage(interaction);
    await interaction.reply({ content: `🏴 Carteles: **${state.carteles}**`, ephemeral: true });
  }

  else if (commandName === 'evento') {
    if (!hasGeneralPermission(interaction.member)) return interaction.reply({ content: '❌ Sin permiso.', ephemeral: true });
    state.evento = interaction.options.getString('nombre');
    saveState();
    await updatePermanentMessage(interaction);
    await interaction.reply({ content: `🎉 Evento: **${state.evento}**`, ephemeral: true });
  }

  else if (commandName === 'terminar-evento') {
    if (!hasGeneralPermission(interaction.member)) return interaction.reply({ content: '❌ Sin permiso.', ephemeral: true });
    state.evento = 'Sin eventos';
    saveState();
    await updatePermanentMessage(interaction);
    await interaction.reply({ content: '✅ Evento terminado.', ephemeral: true });
  }

  else if (commandName === 'votacion') {
    if (!hasGeneralPermission(interaction.member)) return interaction.reply({ content: '❌ Sin permiso.', ephemeral: true });

    const numero = interaction.options.getInteger('numero');
    const iniciador = `<@${interaction.user.id}>`;
    const voteContent = `🚦 **Votación Activa** 🚦
-------------------------------------------------------------------------------
📍⠇Se Acaba De Iniciar Una Votación Para Empezar Una Sesión De Roleplay
💳 ⠇Asegúrate De Tener Tus Documentos En Regla Para Evitar Conflictos
🚗 ⠇Ten Siempre Registrado Tu Vehículo Para Salvarte De Una Multa Costosa
📚⠇Revisa Nuestras Reglas En ⁠📘⠇normativa-roleplay
-------------------------------------------------------------------------------
**Votos requeridos:** \`${numero}\`
**Votación iniciada por:** ${iniciador}
@everyone`;

    const voteMsg = await interaction.channel.send({ content: voteContent });
    await voteMsg.react('✅');
    activeVotes.set(voteMsg.id, { required: numero, reached: false, startedBy: interaction.user.id });
    scheduleDelete(voteMsg, 40 * 60 * 1000);

    await interaction.reply({ content: `✅ Votación iniciada. Se necesitan **${numero}** ✅`, ephemeral: true });
  }

  // ===== AGREGAR STATS: SOLO ROL PERMANENTE =====
  else if (commandName === 'agregar-dias') {
    if (!canUsePermanentMessage(interaction.member)) {
      return interaction.reply({
        content: '❌ Solo el rol de **mensaje permanente** (o Administradores) puede modificar estadísticas.',
        ephemeral: true
      });
    }
    const target = interaction.options.getUser('usuario');
    const cantidad = interaction.options.getInteger('cantidad');
    const userStats = getUserStats(target.id);
    for (let i = 0; i < cantidad; i++) {
      userStats.activeDays.add(`manual-${Date.now()}-${i}`);
    }
    userStats.activeDays = Array.from(userStats.activeDays);
    saveStats();
    await interaction.reply({ content: `✅ +**${cantidad}** día(s) a <@${target.id}>`, ephemeral: true });
  }

  else if (commandName === 'agregar-tiempo') {
    if (!canUsePermanentMessage(interaction.member)) {
      return interaction.reply({
        content: '❌ Solo el rol de **mensaje permanente** (o Administradores) puede modificar estadísticas.',
        ephemeral: true
      });
    }
    const target = interaction.options.getUser('usuario');
    const minutos = interaction.options.getInteger('minutos');
    const ms = minutos * 60 * 1000;
    const userStats = getUserStats(target.id);

    userStats.totalHours = (userStats.totalHours || 0) + ms;
    const weekKey = getWeekKey();
    const monthKey = getMonthKey();
    if (!userStats.weekly) userStats.weekly = {};
    if (!userStats.monthly) userStats.monthly = {};
    userStats.weekly[weekKey] = (userStats.weekly[weekKey] || 0) + ms;
    userStats.monthly[monthKey] = (userStats.monthly[monthKey] || 0) + ms;
    if (!userStats.sessions) userStats.sessions = [];
    userStats.sessions.push({ start: Date.now(), end: Date.now(), durationMs: ms, agregado: true });
    saveStats();

    await interaction.reply({
      content: `✅ +**${formatDuration(ms)}** (${minutos} min) a <@${target.id}>\nEn sesiones aparecerá como **agregado**.`,
      ephemeral: true
    });
  }

  else if (commandName === 'agregar-rps-abiertos') {
    if (!canUsePermanentMessage(interaction.member)) {
      return interaction.reply({
        content: '❌ Solo el rol de **mensaje permanente** (o Administradores) puede modificar estadísticas.',
        ephemeral: true
      });
    }
    const target = interaction.options.getUser('usuario');
    const cantidad = interaction.options.getInteger('cantidad');
    const userStats = getUserStats(target.id);
    userStats.rpsOpened = (userStats.rpsOpened || 0) + cantidad;
    saveStats();
    await interaction.reply({ content: `✅ +**${cantidad}** RP(s) abierto(s) a <@${target.id}>`, ephemeral: true });
  }

  else if (commandName === 'agregar-rps-cerrados') {
    if (!canUsePermanentMessage(interaction.member)) {
      return interaction.reply({
        content: '❌ Solo el rol de **mensaje permanente** (o Administradores) puede modificar estadísticas.',
        ephemeral: true
      });
    }
    const target = interaction.options.getUser('usuario');
    const cantidad = interaction.options.getInteger('cantidad');
    const userStats = getUserStats(target.id);
    userStats.rpsFinished = (userStats.rpsFinished || 0) + cantidad;
    saveStats();
    await interaction.reply({ content: `✅ +**${cantidad}** RP(s) finalizado(s) a <@${target.id}>`, ephemeral: true });
  }

  else {
    if (!hasGeneralPermission(interaction.member)) {
      return interaction.reply({ content: '❌ Sin permiso.', ephemeral: true });
    }

    const target = interaction.options.getUser('usuario') || interaction.user;
    const userStats = getUserStats(target.id);
    if (!(userStats.activeDays instanceof Set)) {
      userStats.activeDays = new Set(userStats.activeDays || []);
    }

    const createLeaderboard = (title, sortKey, formatFn) => {
      const sorted = Object.entries(stats)
        .map(([id, s]) => {
          let value = 0;
          if (sortKey === 'totalHours') value = s.totalHours || 0;
          else if (sortKey === 'rpsOpened') value = s.rpsOpened || 0;
          else if (sortKey === 'rpsFinished') value = s.rpsFinished || 0;
          else if (sortKey === 'activeDays') value = s.activeDays ? (Array.isArray(s.activeDays) ? s.activeDays.length : s.activeDays.size) : 0;
          else if (sortKey === 'weekly') value = s.weekly?.[getWeekKey()] || 0;
          else if (sortKey === 'monthly') value = s.monthly?.[getMonthKey()] || 0;
          return { id, value };
        })
        .filter(x => x.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      const desc = sorted.map((e, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
        return `${medal} <@${e.id}> → **${formatFn(e.value)}**`;
      }).join('\n') || 'Sin datos todavía.';

      return new EmbedBuilder()
        .setColor(PINK)
        .setTitle(`🌸 ${title}`)
        .setDescription(desc)
        .setFooter({ text: 'Florida States RP • v2.1.0' })
        .setTimestamp();
    };

    if (commandName === 'rp-stats') {
      const days = userStats.activeDays instanceof Set ? userStats.activeDays.size : (userStats.activeDays?.length || 0);
      const embed = new EmbedBuilder()
        .setColor(PINK)
        .setTitle(`📊 Estadísticas de ${target.username}`)
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          { name: '⏱️ Horas totales', value: formatDuration(userStats.totalHours || 0), inline: true },
          { name: '🟢 RPs abiertos', value: `${userStats.rpsOpened || 0}`, inline: true },
          { name: '🏁 RPs finalizados', value: `${userStats.rpsFinished || 0}`, inline: true },
          { name: '📅 Días activos', value: `${days}`, inline: true },
          { name: '📆 Esta semana', value: formatDuration(userStats.weekly?.[getWeekKey()] || 0), inline: true },
          { name: '🗓️ Este mes', value: formatDuration(userStats.monthly?.[getMonthKey()] || 0), inline: true }
        )
        .setFooter({ text: 'Florida States RP • v2.1.0' })
        .setTimestamp();
      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'horas-totales') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(PINK).setTitle(`⏱️ Horas totales de ${target.username}`)
            .setDescription(`**${formatDuration(userStats.totalHours || 0)}**`).setThumbnail(target.displayAvatarURL())]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('Horas Totales en RP', 'totalHours', formatDuration)] });
      }
    }

    else if (commandName === 'rps-abiertos') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(PINK).setTitle(`🟢 RPs abiertos de ${target.username}`)
            .setDescription(`**${userStats.rpsOpened || 0}**`)]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('RPs Abiertos', 'rpsOpened', v => v)] });
      }
    }

    else if (commandName === 'rps-finalizados') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(PINK).setTitle(`🏁 RPs finalizados de ${target.username}`)
            .setDescription(`**${userStats.rpsFinished || 0}**`)]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('RPs Finalizados', 'rpsFinished', v => v)] });
      }
    }

    else if (commandName === 'dias-activos') {
      const days = userStats.activeDays instanceof Set ? userStats.activeDays.size : (userStats.activeDays?.length || 0);
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(PINK).setTitle(`📅 Días activos de ${target.username}`)
            .setDescription(`**${days}** días`)]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('Días Activos en RP', 'activeDays', v => `${v} días`)] });
      }
    }

    else if (commandName === 'actividad-semanal') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(PINK).setTitle(`📆 Actividad semanal de ${target.username}`)
            .setDescription(`**${formatDuration(userStats.weekly?.[getWeekKey()] || 0)}**`)]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('Actividad Semanal', 'weekly', formatDuration)] });
      }
    }

    else if (commandName === 'actividad-mensual') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(PINK).setTitle(`🗓️ Actividad mensual de ${target.username}`)
            .setDescription(`**${formatDuration(userStats.monthly?.[getMonthKey()] || 0)}**`)]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('Actividad Mensual', 'monthly', formatDuration)] });
      }
    }

    else if (commandName === 'duracion-sesiones') {
      const sessions = (userStats.sessions || []).slice(-10).reverse();
      const desc = sessions.map((s, i) => {
        if (s.agregado) return `\`${i + 1}.\` ${formatDuration(s.durationMs)} — **agregado**`;
        return `\`${i + 1}.\` ${formatDuration(s.durationMs)} — <t:${Math.floor(s.start / 1000)}:d>`;
      }).join('\n') || 'Sin sesiones registradas.';

      await interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(PINK)
          .setTitle(`📋 Últimas sesiones de ${target.username}`)
          .setDescription(desc)
          .setFooter({ text: 'Mostrando las últimas 10' })]
      });
    }
  }
});

client.login(process.env.TOKEN);
