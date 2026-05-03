const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ]
});

const invites = new Map();

client.once('ready', async () => {
  console.log(${client.user.tag} is online!);

  client.guilds.cache.forEach(async guild => {
    const guildInvites = await guild.invites.fetch();
    invites.set(guild.id, guildInvites);
  });
});

// Track invite updates
client.on('inviteCreate', async invite => {
  const guildInvites = await invite.guild.invites.fetch();
  invites.set(invite.guild.id, guildInvites);
});

client.on('guildMemberAdd', async member => {
  const channel = member.guild.channels.cache.get('1500069003157176442'); // put your welcome channel ID

  const newInvites = await member.guild.invites.fetch();
  const oldInvites = invites.get(member.guild.id);

  const usedInvite = newInvites.find(inv =>
    oldInvites.get(inv.code)?.uses < inv.uses
  );

  const inviter = usedInvite?.inviter  'Unknown';
  const inviteCount = usedInvite?.uses 
 0;

  invites.set(member.guild.id, newInvites);

  const memberNumber = member.guild.memberCount;

  const embed = new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('🔥 Welcome to the Server!')
    .setDescription(
      👋 Welcome ${member}!\n\n +
      📊 You are the **${memberNumber}th member**\n +
      📨 Invited by: **${inviter.tag || inviter}**\n +
      🎟️ They now have **${inviteCount} invites**
    )
    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
    .setImage(https://api.dicebear.com/7.x/bottts/png?seed=${member.user.username})
    .setFooter({ text: 'Enjoy your stay!' })
    .setTimestamp();

  channel.send({ embeds: [embed] });
});

client.login('MTUwMDU1NzQ2MDI3NTIwNDIwNg.GEikwz.85a_Osp-Gik9ZEMZ92HwkkTiKvpOimhCi7n0eI');
