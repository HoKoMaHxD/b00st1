import { Client, Events, GatewayIntentBits } from 'discord.js';
import { ProfileReader } from './profile.js';
import { readConfig } from './config.js';
import { createCommandHandlers, registerGuildCommands, errorCode } from './commands.js';

let config;
try { config = readConfig(); }
catch (error) { console.error(error.message); process.exit(1); }
const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages];
if (config.messageContent) intents.push(GatewayIntentBits.MessageContent);
const client = new Client({ intents });
const reader = new ProfileReader(config.readerToken);
const handlers = createCommandHandlers({ reader, config });

client.once(Events.ClientReady, async bot => {
  console.log(`جاهز: ${bot.user.tag} | -نيترو | -بوست | -ping | /ping`);
  console.log(`GUILD_ID=${config.guildId || 'ALL'} | CHANNEL_ID=${config.channelId || 'ALL'} | MessageContent=${config.messageContent}`);
  if (config.readerToken) console.warn('قارئ غير رسمي مفعّل: أتمتة حساب عادي قد تؤدي إلى إغلاق الحساب.');
  else console.warn('READER_TOKEN غير مضبوط؛ الأوامر تعمل لكن قراءة تواريخ الشارات غير مفعلة. جرّب -ping.');
  if (!config.messageContent) console.warn('الأوامر النصية العادية تحتاج Message Content Intent. استخدم /ping أو منشن البوت ثم بوست أو نيترو.');
  if (config.guildId && !bot.guilds.cache.has(config.guildId)) console.warn('[GUILD_NOT_FOUND] البوت غير موجود في GUILD_ID المحدد. صحح المتغير أو احذفه وأعد التشغيل.');
  if (config.channelId) {
    try {
      const channel = await bot.channels.fetch(config.channelId);
      if (!channel?.isTextBased() || !channel.guildId || (config.guildId && channel.guildId !== config.guildId)) {
        console.warn('[CHANNEL_NOT_FOUND] CHANNEL_ID ليس رومًا نصيًا متاحًا في السيرفر المطلوب.');
      }
    } catch (error) { console.warn(`[CHANNEL_NOT_FOUND] code=${errorCode(error)}: راجع CHANNEL_ID وصلاحية View Channels.`); }
  }
  for (const guild of bot.guilds.cache.values()) await registerGuildCommands(bot, guild, config);
});
client.on(Events.GuildCreate, guild => registerGuildCommands(client, guild, config));
client.on(Events.MessageCreate, message => {
  handlers.onMessage(message).catch(error => console.error(`[MESSAGE_HANDLER] ${errorCode(error)}`));
});
client.on(Events.InteractionCreate, interaction => {
  handlers.onInteraction(interaction).catch(error => console.error(`[INTERACTION_HANDLER] ${errorCode(error)}`));
});
setInterval(handlers.cleanup, 60000).unref();
client.on(Events.Error, error => console.error(`[DISCORD_ERROR] ${errorCode(error)}`));
client.on(Events.ShardDisconnect, event => {
  console.warn(`[DISCORD_DISCONNECT] code=${event.code}`);
  if (event.code === 4014) console.error('فعّل Message Content Intent في Developer Portal > Bot وأعد التشغيل. أو اضبط MESSAGE_CONTENT_INTENT=false واستخدم أوامر / أو منشن البوت.');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { client.destroy(); process.exit(0); });
client.login(config.token).catch(error => {
  console.error(`[LOGIN_FAILED] ${errorCode(error)}: تحقق من BOT_TOKEN وMessage Content Intent. للتشغيل بدون Intent اضبط MESSAGE_CONTENT_INTENT=false واستخدم أوامر / أو منشن البوت.`);
  process.exit(1);
});
