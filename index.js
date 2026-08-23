const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
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
  status: 'closed',          // closed | active | frp
  messageId: null,
  channelId: null,
  startedBy: null,
  startTime: null,
  pausedAt: null,
  totalPausedMs: 0,
  allowedRoles: [],          // Roles que pueden usar botones + todos los comandos
  permanentMessageRole: null, // Único rol que puede usar /mensaje-permanente
  mentionRole: null,         // Rol que se menciona en apertura y cierre
  vias: null,                // 1 o 2
  limite: null,              // límite de velocidad
  evento: 'Sin eventos'      // Nombre del evento actual
});

let stats = loadJSON(STATS_FILE, {});

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

// Función para verificar si el usuario tiene permiso general (botones + comandos)
function hasGeneralPermission(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (state.allowedRoles.length === 0) return true;
  return member.roles.cache.some(r => state.allowedRoles.includes(r.id));
}

// Función para verificar si puede usar /mensaje-permanente
function canUsePermanentMessage(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (!state.permanentMessageRole) return false;
  return member.roles.cache.has(state.permanentMessageRole);
}

// ====================== EMBEDS ROSA ======================
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

  // Vías y Límite de Velocidad
  let viasDisplay = state.status === 'frp' ? '-' : (state.vias !== null ? state.vias : 'No definido');
  let limiteDisplay = state.status === 'frp' ? '-' : (state.limite !== null ? state.limite : 'No definido');

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('🌸 Estado del Rol ・ Florida States RP')
    .setDescription(`\`\`\`\n${statusText}\n\`\`\``)
    .addFields(
      { name: '🛣️ Vías', value: `\`${viasDisplay}\``, inline: true },
      { name: '🏎️ Límite de Velocidad', value: `\`${limiteDisplay}\``, inline: true },
      { name: '🎉 Evento', value: `\`${state.evento || 'Sin eventos'}\``, inline: true },
      { name: '📅 Última actualización', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: false }
    )
    .setFooter({ text: 'Florida States RP • Solo staff autorizado puede cambiar el estado' })
    .setTimestamp();

  return embed;
}

function createButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('activar_rol')
      .setLabel('Activar Rol')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🟢'),
    new ButtonBuilder()
      .setCustomId('cerrar_rol')
      .setLabel('Cerrar Rol')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🏁'),
    new ButtonBuilder()
      .setCustomId('activar_frp')
      .setLabel('Activar FRP-Farming')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⏸️'),
    new ButtonBuilder()
      .setCustomId('desactivar_frp')
      .setLabel('Desactivar FRP-Farming')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('▶️')
  );
}

// ====================== MENSAJES AUTOMÁTICOS (se borran en 15 min) ======================
function getAperturaMsg() {
  const mention = state.mentionRole ? `<@&${state.mentionRole}>` : '';
  return `# 🚨・APERTURA DE ROL
${mention}
> Al iniciar el rol, **todos deberán tener sus papeles y documentos en regla.** 📄
🚗・**Licencia**
🪪・**Identificación**
📋・**Documentación del vehículo**
📑・**Cualquier otro documento requerido**
> ⚠️ **Si no cuentan con los documentos correspondientes o incumplen las normas de rol, podrán ser KICKEADOS del servidor sin previo aviso.**
### 🔒・¡TODO EN REGLA ANTES DE COMENZAR! 🚨`;
}

function getCierreMsg() {
  const mention = state.mentionRole ? `<@&${state.mentionRole}>` : '';
  return `# 🏁・CIERRE DE ROL
${mention}
> ❤️ Gracias a todos por participar en el rol de hoy.
⭐ **No olviden calificar a los administradores** que estuvieron apoyando durante el rol en <#1452871884071899217>.
🙏 Agradecemos muchísimo a todos los **moderadores y administradores** que estuvieron pendientes y apoyando el servidor durante el rol.
> 💙 ¡Gracias por ser parte de **Florida States RP**!`;
}

const FRP_MSG = `# ⏸️・FRP-FARMING ACTIVADO
> 🚨 **SE PAUSÓ / APAGÓ EL ROL** para realizar actividades de **FRP-Farming**.
⚠️ **IMPORTANTE:** Esto **NO significa necesariamente que el rol se cerró**. El FRP-Farming puede activarse con el rol abierto, como es habitual.
📢 Se avisará cuando el rol vuelva a estar activo normalmente.`;

async function sendTempMessage(channel, content) {
  const msg = await channel.send({ content });
  setTimeout(() => {
    msg.delete().catch(() => {});
  }, 15 * 60 * 1000);
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
  // Verificar permiso general
  if (!hasGeneralPermission(interaction.member)) {
    return interaction.reply({
      content: '❌ No tienes permiso para usar estos botones.',
      ephemeral: true
    });
  }

  const userId = interaction.user.id;
  const userStats = getUserStats(userId);
  const now = Date.now();

  const confirm = async (text) => {
    await interaction.reply({ content: text, ephemeral: true });
  };

  switch (interaction.customId) {
    case 'activar_rol': {
      if (state.status === 'active') {
        return confirm('⚠️ El rol ya está activo.');
      }

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
      await sendTempMessage(interaction.channel, getAperturaMsg());
      await confirm('🟢 **Rol activado** correctamente.');
      break;
    }

    case 'cerrar_rol': {
      if (state.status === 'closed') {
        return confirm('⚠️ El rol ya está cerrado.');
      }

      let duration = 0;
      if (state.startTime) {
        const totalElapsed = now - state.startTime;
        duration = totalElapsed - (state.totalPausedMs || 0);
        if (state.pausedAt) {
          duration -= (now - state.pausedAt);
        }
        if (duration < 0) duration = 0;
      }

      const openerId = state.startedBy || userId;
      const openerStats = getUserStats(openerId);

      openerStats.totalHours += duration;
      openerStats.rpsFinished++;
      openerStats.sessions.push({
        start: state.startTime,
        end: now,
        durationMs: duration
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
      await sendTempMessage(interaction.channel, getCierreMsg());
      await confirm(`🏁 **Rol cerrado**. Duración de esta sesión: **${formatDuration(duration)}**`);
      break;
    }

    case 'activar_frp': {
      if (state.status === 'frp') {
        return confirm('⚠️ FRP-Farming ya está activo.');
      }
      if (state.status === 'closed') {
        state.status = 'frp';
      } else {
        state.pausedAt = now;
        state.status = 'frp';
      }

      saveState();
      await updatePermanentMessage(interaction);
      await sendTempMessage(interaction.channel, FRP_MSG);
      await confirm('⏸️ **FRP-Farming activado**. El temporizador de RP se ha pausado.');
      break;
    }

    case 'desactivar_frp': {
      if (state.status !== 'frp') {
        return confirm('⚠️ FRP-Farming no está activo.');
      }

      if (state.pausedAt && state.startTime) {
        state.totalPausedMs += (now - state.pausedAt);
        state.pausedAt = null;
        state.status = 'active';
      } else {
        state.status = 'closed';
      }

      saveState();
      await updatePermanentMessage(interaction);
      await confirm('▶️ **FRP-Farming desactivado**. El temporizador de RP continúa.');
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
    .addRoleOption(opt => opt.setName('rol').setDescription('Rol general (botones + comandos) - se añade/quita').setRequired(true))
    .addRoleOption(opt => opt.setName('rol-permanente').setDescription('Rol ÚNICO que puede usar /mensaje-permanente').setRequired(false))
    .addRoleOption(opt => opt.setName('rol-mencion').setDescription('Rol que se mencionará en los mensajes de apertura y cierre').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('vias')
    .setDescription('Configura el número de vías (1 o 2)')
    .addIntegerOption(opt => opt.setName('valor').setDescription('Número de vías (1 o 2)').setRequired(true).setMinValue(1).setMaxValue(2)),

  new SlashCommandBuilder()
    .setName('limite')
    .setDescription('Configura el límite de velocidad')
    .addIntegerOption(opt => opt.setName('valor').setDescription('Límite de velocidad').setRequired(true).setMinValue(1)),

  new SlashCommandBuilder()
    .setName('evento')
    .setDescription('Activa un evento y lo muestra en el mensaje permanente')
    .addStringOption(opt => opt.setName('nombre').setDescription('Nombre del evento').setRequired(true)),

  new SlashCommandBuilder()
    .setName('terminar-evento')
    .setDescription('Termina el evento actual y lo pone en "Sin eventos"'),

  new SlashCommandBuilder()
    .setName('rp-stats')
    .setDescription('Ver estadísticas de RP de un usuario')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario a consultar').setRequired(false)),

  new SlashCommandBuilder()
    .setName('horas-totales')
    .setDescription('Leaderboard o stats de horas totales en RP')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver de un usuario específico').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rps-abiertos')
    .setDescription('Leaderboard de RPs abiertos')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver de un usuario específico').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rps-finalizados')
    .setDescription('Leaderboard de RPs finalizados')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver de un usuario específico').setRequired(false)),

  new SlashCommandBuilder()
    .setName('dias-activos')
    .setDescription('Leaderboard de días activos en RP')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver de un usuario específico').setRequired(false)),

  new SlashCommandBuilder()
    .setName('actividad-semanal')
    .setDescription('Leaderboard de actividad semanal (horas)')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver de un usuario específico').setRequired(false)),

  new SlashCommandBuilder()
    .setName('actividad-mensual')
    .setDescription('Leaderboard de actividad mensual (horas)')
    .addUserOption(opt => opt.setName('usuario').setDescription('Ver de un usuario específico').setRequired(false)),

  new SlashCommandBuilder()
    .setName('duracion-sesiones')
    .setDescription('Ver duración de las sesiones de un usuario')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuario').setRequired(false))
].map(c => c.toJSON());

// ====================== REGISTRO DE COMANDOS ======================
client.once('ready', async () => {
  console.log(`🌸 Bot listo como ${client.user.tag}`);

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

// ====================== AUTO-BORRADO DE MENSAJES (10 minutos) ======================
client.on('messageCreate', async (message) => {
  // Ignorar mensajes del propio bot
  if (message.author.bot) return;

  // Solo actuar en el canal del mensaje permanente
  if (!state.channelId || message.channel.id !== state.channelId) return;

  // No borrar el mensaje permanente
  if (message.id === state.messageId) return;

  // Borrar el mensaje después de 10 minutos
  setTimeout(() => {
    message.delete().catch(() => {});
  }, 10 * 60 * 1000);
});

// ====================== INTERACCIONES ======================
client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    return handleButton(interaction);
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // ========== /mensaje-permanente ==========
  if (commandName === 'mensaje-permanente') {
    if (!canUsePermanentMessage(interaction.member)) {
      return interaction.reply({
        content: '❌ Solo el rol configurado como **rol-permanente** (o Administradores) puede usar este comando.',
        ephemeral: true
      });
    }

    const msg = await interaction.channel.send({
      embeds: [createStatusEmbed()],
      components: [createButtons()]
    });

    state.messageId = msg.id;
    state.channelId = interaction.channel.id;
    saveState();

    await interaction.reply({
      content: '✅ Mensaje permanente colocado correctamente en este canal.',
      ephemeral: true
    });
  }

  // ========== /config-roles ==========
  else if (commandName === 'config-roles') {
    const role = interaction.options.getRole('rol');
    const permanentRole = interaction.options.getRole('rol-permanente');
    const mentionRole = interaction.options.getRole('rol-mencion');

    let response = '';

    // Manejar rol general (añadir/quitar)
    const idx = state.allowedRoles.indexOf(role.id);
    if (idx === -1) {
      state.allowedRoles.push(role.id);
      response += `✅ Rol general **${role.name}** añadido (puede usar botones y comandos).\n`;
    } else {
      state.allowedRoles.splice(idx, 1);
      response += `🗑️ Rol general **${role.name}** eliminado.\n`;
    }

    // Manejar rol permanente
    if (permanentRole) {
      state.permanentMessageRole = permanentRole.id;
      response += `🔒 Rol para **/mensaje-permanente** configurado como: **${permanentRole.name}**\n`;
    }

    // Manejar rol de mención
    if (mentionRole) {
      state.mentionRole = mentionRole.id;
      response += `📢 Rol de mención configurado como: **${mentionRole.name}** (se mencionará en apertura y cierre)`;
    }

    saveState();

    await interaction.reply({
      content: response || 'No se realizaron cambios.',
      ephemeral: true
    });
  }

  // ========== /vias ==========
  else if (commandName === 'vias') {
    if (!hasGeneralPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ No tienes permiso para usar este comando.',
        ephemeral: true
      });
    }

    const valor = interaction.options.getInteger('valor');
    state.vias = valor;
    saveState();
    await updatePermanentMessage(interaction);

    await interaction.reply({
      content: `✅ Vías actualizadas a: **${valor}**`,
      ephemeral: true
    });
  }

  // ========== /limite ==========
  else if (commandName === 'limite') {
    if (!hasGeneralPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ No tienes permiso para usar este comando.',
        ephemeral: true
      });
    }

    const valor = interaction.options.getInteger('valor');
    state.limite = valor;
    saveState();
    await updatePermanentMessage(interaction);

    await interaction.reply({
      content: `✅ Límite de velocidad actualizado a: **${valor}**`,
      ephemeral: true
    });
  }

  // ========== /evento ==========
  else if (commandName === 'evento') {
    if (!hasGeneralPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ No tienes permiso para usar este comando.',
        ephemeral: true
      });
    }

    const nombre = interaction.options.getString('nombre');
    state.evento = nombre;
    saveState();
    await updatePermanentMessage(interaction);

    await interaction.reply({
      content: `🎉 Evento activado: **${nombre}**`,
      ephemeral: true
    });
  }

  // ========== /terminar-evento ==========
  else if (commandName === 'terminar-evento') {
    if (!hasGeneralPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ No tienes permiso para usar este comando.',
        ephemeral: true
      });
    }

    state.evento = 'Sin eventos';
    saveState();
    await updatePermanentMessage(interaction);

    await interaction.reply({
      content: `✅ Evento terminado. Ahora muestra: **Sin eventos**`,
      ephemeral: true
    });
  }

  // ========== TODOS LOS DEMÁS COMANDOS ==========
  else {
    // Verificar permiso general
    if (!hasGeneralPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ No tienes permiso para usar este comando.',
        ephemeral: true
      });
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
          else if (sortKey === 'activeDays') value = (s.activeDays ? (Array.isArray(s.activeDays) ? s.activeDays.length : s.activeDays.size) : 0);
          else if (sortKey === 'weekly') {
            const key = getWeekKey();
            value = s.weekly?.[key] || 0;
          } else if (sortKey === 'monthly') {
            const key = getMonthKey();
            value = s.monthly?.[key] || 0;
          }
          return { id, value };
        })
        .filter(x => x.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 10);

      let desc = sorted.map((e, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `\`${i + 1}.\``;
        return `${medal} <@${e.id}> → **${formatFn(e.value)}**`;
      }).join('\n') || 'Sin datos todavía.';

      return new EmbedBuilder()
        .setColor(PINK)
        .setTitle(`🌸 ${title}`)
        .setDescription(desc)
        .setFooter({ text: 'Florida States RP' })
        .setTimestamp();
    };

    if (commandName === 'rp-stats') {
      const days = userStats.activeDays instanceof Set
        ? userStats.activeDays.size
        : (userStats.activeDays?.length || 0);

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
        .setFooter({ text: 'Florida States RP' })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'horas-totales') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(PINK)
            .setTitle(`⏱️ Horas totales de ${target.username}`)
            .setDescription(`**${formatDuration(userStats.totalHours || 0)}**`)
            .setThumbnail(target.displayAvatarURL())]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('Horas Totales en RP', 'totalHours', formatDuration)] });
      }
    }

    else if (commandName === 'rps-abiertos') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(PINK)
            .setTitle(`🟢 RPs abiertos de ${target.username}`)
            .setDescription(`**${userStats.rpsOpened || 0}**`)]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('RPs Abiertos', 'rpsOpened', v => v)] });
      }
    }

    else if (commandName === 'rps-finalizados') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(PINK)
            .setTitle(`🏁 RPs finalizados de ${target.username}`)
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
          embeds: [new EmbedBuilder()
            .setColor(PINK)
            .setTitle(`📅 Días activos de ${target.username}`)
            .setDescription(`**${days}** días`)]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('Días Activos en RP', 'activeDays', v => `${v} días`)] });
      }
    }

    else if (commandName === 'actividad-semanal') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(PINK)
            .setTitle(`📆 Actividad semanal de ${target.username}`)
            .setDescription(`**${formatDuration(userStats.weekly?.[getWeekKey()] || 0)}**`)]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('Actividad Semanal', 'weekly', formatDuration)] });
      }
    }

    else if (commandName === 'actividad-mensual') {
      if (interaction.options.getUser('usuario')) {
        await interaction.reply({
          embeds: [new EmbedBuilder()
            .setColor(PINK)
            .setTitle(`🗓️ Actividad mensual de ${target.username}`)
            .setDescription(`**${formatDuration(userStats.monthly?.[getMonthKey()] || 0)}**`)]
        });
      } else {
        await interaction.reply({ embeds: [createLeaderboard('Actividad Mensual', 'monthly', formatDuration)] });
      }
    }

    else if (commandName === 'duracion-sesiones') {
      const sessions = (userStats.sessions || []).slice(-10).reverse();
      let desc = sessions.map((s, i) => {
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

// ====================== LOGIN ======================
client.login(process.env.TOKEN);
