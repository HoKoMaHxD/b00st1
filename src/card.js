import { EmbedBuilder, AttachmentBuilder } from 'discord.js';
import { renderBadgeImage } from './image.js';
import { progress, symbols, initialNitroSymbol, label, timestamp } from './badges.js';
export async function makeCard(user, kind, since, now = new Date()) {
  const state = progress(kind, since, now);
  const next = state.upcoming[0];
  const currentSymbol = state.current < 0 ? initialNitroSymbol : symbols[kind][state.current];
  const currentLabel = state.current < 0 ? 'Nitro' : kind === 'boost' && state.current === 0 ? 'Started Boosting' : label(state.months);
  const name = `${kind}-${user.id}.png`;
  const buffer = await renderBadgeImage({ kind, since, now, username: user.username });
  const embed = new EmbedBuilder()
    .setColor(0x6500a8)
    .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() })
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .setDescription(`Requested by <@${user.id}>`)
    .addFields(
      { name: 'Current Badge', value: `${currentSymbol} **${currentLabel}**`, inline: true },
      { name: 'Next Badge', value: next ? `${symbols[kind][next.index]} ${timestamp(next.date)}` : 'Max Level!', inline: true },
    )
    .setImage(`attachment://${name}`)
    .setFooter({ text: user.client?.user?.username || 'Badges', ...(user.client?.user ? { iconURL: user.client.user.displayAvatarURL() } : {}) })
    .setTimestamp(now);
  if (next) embed.addFields({ name: 'Timeline', value: state.upcoming.slice(0, 5).map(item => `${symbols[kind][item.index]} **${label(item.months)}** → ${timestamp(item.date)}`).join('\n') });
  return { embeds: [embed], files: [new AttachmentBuilder(buffer, { name })], allowedMentions: { parse: [], repliedUser: false } };
}
