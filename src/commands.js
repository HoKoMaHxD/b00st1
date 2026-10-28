import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { makeCard } from './card.js';
import { getStart } from './profile.js';

const aliases = new Map([
  ['نيترو', 'nitro'], ['nitro', 'nitro'], ['بوست', 'boost'], ['boost', 'boost'],
  ['ping', 'ping'], ['بنج', 'ping'], ['help', 'help'], ['مساعدة', 'help'],
]);
export const slashCommands = [
  { name: 'نيترو', description: 'عرض مراحل شارة النيترو لحسابك' },
  { name: 'بوست', description: 'عرض مراحل شارة بوست حسابك' },
  { name: 'ping', description: 'فحص اتصال البوت واستقبال الأوامر' },
];
const errors = {
  NOT_CONFIGURED: 'البوت يستقبل الأوامر، لكن قراءة تاريخ الشارة غير مفعلة. على صاحب البوت إعداد READER_TOKEN؛ توكن البوت الرسمي وحده لا يوفر هذه التواريخ.',
  AUTH: 'تعذر تسجيل دخول قارئ الملفات الشخصية. يحتاج صاحب البوت مراجعة إعداد القارئ وإعادة التشغيل.',
  FORBIDDEN: 'ديسكورد لم يسمح للقارئ بالوصول إلى ملفك الشخصي. تأكد أن حساب القارئ موجود في السيرفر؛ لن أحسب تاريخًا تخمينيًا.',
  RATE_LIMIT: 'ديسكورد طلب الانتظار قبل قراءة ملفات أخرى. جرّب لاحقًا.',
  BUSY: 'هناك طلبات كثيرة الآن. جرّب بعد قليل.',
  NETWORK: 'تعذر الاتصال بديسكورد خلال الوقت المحدد. جرّب مرة أخرى.',
  MISSING_DATE: 'تاريخ بداية الشارة غير متاح من ملفك الشخصي، لذلك لا أستطيع حساب المدة بدقة.',
  NO_DATE: 'لم يرجع ملفك الشخصي تاريخًا نشطًا لهذه الشارة. قد لا يكون الاشتراك/البوست فعالًا أو قد تكون البيانات غير متاحة.',
  UNAVAILABLE: 'تعذرت قراءة بيانات ملفك الشخصي حاليًا. جرّب لاحقًا.',
};
const help = 'الأوامر: -نيترو، -بوست، -ping. متاحة أيضًا: /نيترو، /بوست، /ping. يمكنك كتابة منشن البوت ثم بوست أو نيترو. الأوامر تعرض بيانات صاحب الطلب فقط.';
const mentions = { parse: [], repliedUser: false };
// Log codes only: request objects and full errors can contain credentials.
export function errorCode(error) {
  const code = String(error?.code || error?.name || 'UNKNOWN');
  return /^[A-Za-z0-9_]{1,50}$/.test(code) ? code : 'UNKNOWN';
}

export function parseCommand(content, botId) {
  let text = String(content || '').normalize('NFKC')
    .replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, '')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '').trim().toLowerCase();
  const botMention = botId ? new RegExp(`<@!?${botId}>`, 'g') : null;
  const mentioned = Boolean(botMention && botMention.test(text));
  if (mentioned) text = text.replace(botMention, '').trim();
  if (!text) return mentioned ? 'help' : null;
  const prefixed = /^[-!\u2010-\u2015\u2212]/.test(text);
  if (!prefixed && !mentioned) return null;
  if (prefixed) text = text.slice(1).trimStart();
  return aliases.get(text.split(/\s+/)[0]) || (mentioned ? 'help' : null);
}

export function createCommandHandlers({ reader, config = {}, render = makeCard, logger = console, now = Date.now }) {
  const active = new Set();
  const cooldown = new Map();
  let warnedEmpty = false;
  const warnedScopes = new Set();
  function scope(guildId, channelId) {
    if (config.guildId && config.guildId !== guildId) return 'هذا البوت مخصص لسيرفر آخر حسب إعداد GUILD_ID.';
    if (config.channelId && config.channelId !== channelId) return `الأوامر مفعلة في <#${config.channelId}> فقط حسب إعداد CHANNEL_ID.`;
    return '';
  }
  function logFailure(label, error) { logger.warn(`[${label}] ${errorCode(error)}`); }
  async function report(send, error, kind) {
    logFailure(`command:${kind}`, error);
    const content = Object.hasOwn(errors, error?.code || '') ? errors[error.code] : 'تعذر إرسال النتيجة. راجع سجل البوت وصلاحيات إرسال الرسائل والروابط وإرفاق الصور.';
    try { await send({ content, allowedMentions: mentions }); }
    catch (sendError) { logFailure('error-reply-failed', sendError); }
  }
  async function execute({ kind, user, guildId, channelId, send, defer }) {
    try {
      if (kind === 'ping') {
        await send({ content: 'Pong! ✅ البوت يستقبل الأوامر ويرد. قراءة الشارات تُفحص بأمر -نيترو أو -بوست.', allowedMentions: mentions });
        return;
      }
      if (kind === 'help') { await send({ content: help, allowedMentions: mentions }); return; }
      const key = `${guildId}:${user.id}`;
      if (active.has(key)) { await send({ content: 'طلبك السابق قيد المعالجة. انتظر اكتماله.', allowedMentions: mentions }); return; }
      if ((cooldown.get(key) || 0) > now()) { await send({ content: 'انتظر 3 ثوانٍ بين طلبات الشارات.', allowedMentions: mentions }); return; }
      active.add(key);
      cooldown.set(key, now() + 3000);
      try {
        if (defer) await defer();
        logger.info(`[command:${kind}] guild=${guildId} channel=${channelId}`);
        const profile = await reader.get(user.id, guildId);
        await send(await render(user, kind, getStart(profile, kind)));
      } finally { active.delete(key); }
    } catch (error) { await report(send, error, kind); }
  }
  async function onMessage(message) {
    if (message.author.bot || !message.inGuild()) return;
    if (!message.content) {
      if (!warnedEmpty) {
        warnedEmpty = true;
        logger.warn('[EMPTY_CONTENT] وصلت رسالة بلا محتوى نصي (قد تكون مرفقًا فقط). إذا كانت أمرًا نصيًا، فعّل Message Content Intent في Developer Portal وأعد التشغيل، أو استخدم /ping أو منشن البوت.');
      }
      return;
    }
    const kind = parseCommand(message.content, message.client.user.id);
    if (!kind) return;
    const permissions = message.guild.members.me ? message.channel.permissionsFor(message.guild.members.me) : null;
    const sendFlag = message.channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages;
    if (permissions && (!permissions.has(PermissionFlagsBits.ViewChannel) || !permissions.has(sendFlag))) {
      logger.warn(`[MISSING_PERMISSIONS] channel=${message.channelId}: ViewChannel / ${message.channel.isThread() ? 'SendMessagesInThreads' : 'SendMessages'}`);
      return;
    }
    const send = async payload => {
      if (permissions && !permissions.has(PermissionFlagsBits.ReadMessageHistory)) return message.channel.send(payload);
      try { return await message.reply({ ...payload, failIfNotExists: false }); }
      catch (error) {
        logFailure('message-reply-failed', error);
        return message.channel.send(payload);
      }
    };
    const restriction = scope(message.guildId, message.channelId);
    try {
      if (restriction) {
        const key = `${message.guildId}:${message.channelId}`;
        if (!warnedScopes.has(key)) {
          if (warnedScopes.size >= 100) warnedScopes.clear();
          warnedScopes.add(key);
          logger.warn(`[COMMAND_SCOPE] guild=${message.guildId} channel=${message.channelId}: تحقق من GUILD_ID وCHANNEL_ID.`);
        }
        await send({ content: restriction, allowedMentions: mentions });
        return;
      }
      if (['nitro', 'boost'].includes(kind) && permissions) {
        const missing = ['EmbedLinks', 'AttachFiles'].filter(name => !permissions.has(PermissionFlagsBits[name]));
        if (missing.length) {
          logger.warn(`[MISSING_PERMISSIONS] channel=${message.channelId}: ${missing.join(', ')}`);
          await send({ content: `البوت يستقبل الأمر، لكن يحتاج هذه الصلاحيات في الروم: ${missing.join('، ')}.`, allowedMentions: mentions });
          return;
        }
      }
      await execute({ kind, user: message.author, guildId: message.guildId, channelId: message.channelId, send,
        defer: () => { void message.channel.sendTyping().catch(error => logFailure('typing', error)); } });
    } catch (error) { logFailure('message-handler', error); }
  }
  async function onInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;
    const kind = aliases.get(interaction.commandName);
    if (!kind) return;
    const send = payload => interaction.deferred || interaction.replied ? interaction.editReply(payload) : interaction.reply(payload);
    try {
      const restriction = !interaction.inGuild() ? 'استخدم هذا الأمر داخل السيرفر.' : scope(interaction.guildId, interaction.channelId);
      if (restriction) {
        await interaction.reply({ content: restriction, flags: MessageFlags.Ephemeral, allowedMentions: mentions });
        return;
      }
      await execute({ kind, user: interaction.user, guildId: interaction.guildId, channelId: interaction.channelId,
        send, defer: () => interaction.deferReply() });
    } catch (error) { logFailure('interaction-handler', error); }
  }
  function cleanup() { for (const [id, until] of cooldown) if (until <= now()) cooldown.delete(id); }
  return { onMessage, onInteraction, cleanup };
}

export async function registerGuildCommands(client, guild, config, logger = console) {
  if (config.guildId && guild.id !== config.guildId) return;
  try {
    // Upsert just these commands; preserve any unrelated application commands.
    for (const command of slashCommands) await client.application.commands.create(command, guild.id);
    logger.info(`[SLASH_READY] guild=${guild.id}: /نيترو /بوست /ping`);
  } catch (error) {
    logger.warn(`[SLASH_REGISTER_FAILED] guild=${guild.id} code=${errorCode(error)}: أعد دعوة البوت بنطاقي bot وapplications.commands، وراجع صلاحيات Use Application Commands.`);
  }
}
