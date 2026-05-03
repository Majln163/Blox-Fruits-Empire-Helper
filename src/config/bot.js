const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites
  ]
});

const invites = new Map();
const inviteCounts = new Map();

client.once('ready', async () => {
  console.log(Logged in as ${client.user.tag});

  for (const guild of client.guilds.cache.values()) {
    const guildInvites = await guild.invites.fetch();
    invites.set(guild.id, guildInvites);
  }
});

client.on('inviteCreate', async invite => {
  const guildInvites = await invite.guild.invites.fetch();
  invites.set(invite.guild.id, guildInvites);
});

client.on('guildMemberAdd', async (member) => {
  const guild = member.guild;

  const oldInvites = invites.get(guild.id);
  const newInvites = await guild.invites.fetch();
  invites.set(guild.id, newInvites);

  const usedInvite = newInvites.find(inv =>
    oldInvites?.get(inv.code)?.uses < inv.uses
  );

  const inviter = usedInvite?.inviter  null;

  if (inviter) {
    inviteCounts.set(inviter.id, (inviteCounts.get(inviter.id) 
 0) + 1);
  }

  const inviterCount = inviter ? inviteCounts.get(inviter.id) : 0;

  const channel = guild.channels.cache.find(c => c.name === "welcome");
  if (!channel) return;

  const imageUrl = https://api.popcat.xyz/welcomecard?background=https://i.imgur.com/zY6F6cG.png&text1=Welcome&text2=${member.user.username}&text3=Member+%23${guild.memberCount}&avatar=${member.user.displayAvatarURL({ extension: 'png' })};

  channel.send({
    content: 👋 Welcome ${member}\nInvited by: ${inviter ? inviter.tag : "Unknown"}\nInviter invites: ${inviterCount},
    files: [imageUrl]
  });
});

client.login("MTUwMDU1NzQ2MDI3NTIwNDIwNg.GEikwz.85a_Osp-Gik9ZEMZ92HwkkTiKvpOimhCi7n0eI");
